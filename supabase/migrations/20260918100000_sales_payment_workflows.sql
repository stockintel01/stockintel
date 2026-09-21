begin;

-- Sales could be created but never settled: sale_payments and sales_receipts are
-- append-only with no write path, so a client could not record a payment or issue a
-- receipt. These functions complete that path, keeping both tables append-only and
-- recalculating the sale's paid amount and status from its payments.

create or replace function public.record_sale_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_method text,
  p_paid_at timestamptz default now(),
  p_reference text default null,
  p_idempotency_key text default null,
  p_reversal_of uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_payment_id uuid;
  v_paid numeric;
  v_refunded boolean;
  v_status public.payment_status;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'A payment amount other than zero is required.' using errcode = '22023';
  end if;
  if coalesce(p_method, '') not in ('cash', 'mobile_money', 'bank_transfer', 'card', 'credit', 'refund', 'other') then
    raise exception 'Unsupported payment method.' using errcode = '22023';
  end if;

  select * into v_sale from public.sales sale where sale.id = p_sale_id for update;
  if not found then
    raise exception 'That sale no longer exists.' using errcode = 'P0002';
  end if;
  if v_sale.archived_at is not null then
    raise exception 'That sale is archived.' using errcode = '55000';
  end if;
  if not app_private.has_any_permission(v_sale.organization_id, array['agricPacking']::public.app_permission[]) then
    raise exception 'You do not have permission to record payments for this farm.' using errcode = '42501';
  end if;
  if not app_private.subscription_is_active(v_sale.organization_id) then
    raise exception 'An active subscription is required.' using errcode = '42501';
  end if;
  if p_reversal_of is not null and not exists (
    select 1 from public.sale_payments original
    where original.id = p_reversal_of and original.sale_id = v_sale.id
  ) then
    raise exception 'The payment being reversed belongs to a different sale.' using errcode = '22023';
  end if;

  -- A retried request must not record the amount twice.
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is not null then
    select payment.id into v_payment_id
    from public.sale_payments payment
    where payment.organization_id = v_sale.organization_id
      and payment.idempotency_key = btrim(p_idempotency_key);
  end if;

  if v_payment_id is null then
    insert into public.sale_payments (
      organization_id, sale_id, amount, currency, method, reference, paid_at, recorded_by, reversal_of, idempotency_key
    ) values (
      v_sale.organization_id, v_sale.id, p_amount, v_sale.currency, p_method,
      nullif(btrim(coalesce(p_reference, '')), ''), coalesce(p_paid_at, now()), (select auth.uid()),
      p_reversal_of, nullif(btrim(coalesce(p_idempotency_key, '')), '')
    )
    returning id into v_payment_id;
  end if;

  select coalesce(sum(payment.amount), 0), coalesce(bool_or(payment.amount < 0), false)
  into v_paid, v_refunded
  from public.sale_payments payment
  where payment.sale_id = v_sale.id;

  if v_paid < 0 then
    raise exception 'Payments for a sale cannot total less than zero.' using errcode = '23514';
  end if;

  v_status := (case
    when v_sale.total_amount <= 0 then 'paid'
    when v_paid >= v_sale.total_amount then 'paid'
    when v_paid > 0 then 'partially_paid'
    when v_refunded then 'refunded'
    else 'unpaid'
  end)::public.payment_status;

  update public.sales
  set amount_paid = v_paid,
      payment_status = v_status
  where id = v_sale.id;

  return jsonb_build_object(
    'paymentId', v_payment_id,
    'amountPaid', v_paid,
    'paymentStatus', v_status,
    'totalAmount', v_sale.total_amount,
    'balanceDue', greatest(v_sale.total_amount - v_paid, 0)
  );
end;
$$;

-- The receipt stores what was true when it was issued, built here rather than taken
-- from the caller, so a receipt cannot disagree with the sale it refers to.
create or replace function public.issue_sales_receipt(
  p_sale_id uuid,
  p_template_snapshot jsonb,
  p_pdf_storage_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_existing public.sales_receipts%rowtype;
  v_prefix text;
  v_receipt_number text;
  v_receipt_id uuid;
  v_snapshot jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_template_snapshot is null or jsonb_typeof(p_template_snapshot) <> 'object' then
    raise exception 'Receipt settings are required.' using errcode = '22023';
  end if;

  select * into v_sale from public.sales sale where sale.id = p_sale_id for update;
  if not found then
    raise exception 'That sale no longer exists.' using errcode = 'P0002';
  end if;
  if not app_private.has_any_permission(v_sale.organization_id, array['agricPacking']::public.app_permission[]) then
    raise exception 'You do not have permission to issue receipts for this farm.' using errcode = '42501';
  end if;
  if not app_private.subscription_is_active(v_sale.organization_id) then
    raise exception 'An active subscription is required.' using errcode = '42501';
  end if;

  -- Reprinting returns the receipt already issued instead of burning a new number.
  select * into v_existing
  from public.sales_receipts receipt
  where receipt.sale_id = v_sale.id
    and receipt.voided_at is null
  order by receipt.issued_at desc
  limit 1;
  if found then
    return jsonb_build_object(
      'receiptId', v_existing.id,
      'receiptNumber', v_existing.receipt_number,
      'issuedAt', v_existing.issued_at,
      'reissued', true
    );
  end if;

  v_prefix := upper(regexp_replace(coalesce(nullif(btrim(p_template_snapshot ->> 'receiptPrefix'), ''), 'RCPT'), '[^A-Za-z0-9-]', '', 'g'));
  v_prefix := coalesce(nullif(left(v_prefix, 12), ''), 'RCPT');
  v_receipt_number := app_private.next_document_number(v_sale.organization_id, 'sales_receipt', v_prefix);

  v_snapshot := jsonb_build_object(
    'sale', to_jsonb(v_sale) - 'legacy_firebase_id',
    'customer', (
      select to_jsonb(customer) - 'legacy_firebase_id'
      from public.customers customer
      where customer.id = v_sale.customer_id
    ),
    'items', (
      select coalesce(jsonb_agg(to_jsonb(line) order by line.description), '[]'::jsonb)
      from public.sale_items line
      where line.sale_id = v_sale.id
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'amount', payment.amount,
        'method', payment.method,
        'reference', payment.reference,
        'paidAt', payment.paid_at
      ) order by payment.paid_at), '[]'::jsonb)
      from public.sale_payments payment
      where payment.sale_id = v_sale.id
    )
  );

  insert into public.sales_receipts (
    organization_id, sale_id, receipt_number, template_snapshot, sale_snapshot, pdf_storage_path, issued_by
  ) values (
    v_sale.organization_id, v_sale.id, v_receipt_number, p_template_snapshot, v_snapshot,
    nullif(btrim(coalesce(p_pdf_storage_path, '')), ''), (select auth.uid())
  )
  returning id into v_receipt_id;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, new_record)
  values (
    v_sale.organization_id, (select auth.uid()), 'receipt.issued', 'sales_receipts', v_receipt_id::text,
    jsonb_build_object('saleId', v_sale.id, 'receiptNumber', v_receipt_number)
  );

  return jsonb_build_object(
    'receiptId', v_receipt_id,
    'receiptNumber', v_receipt_number,
    'saleSnapshot', v_snapshot,
    'reissued', false
  );
end;
$$;

create or replace function public.void_sales_receipt(p_receipt_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.sales_receipts%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required to void a receipt.' using errcode = '22023';
  end if;

  select * into v_receipt from public.sales_receipts receipt where receipt.id = p_receipt_id for update;
  if not found then
    raise exception 'That receipt no longer exists.' using errcode = 'P0002';
  end if;
  -- Voiding a financial document is a management action, not an everyday packhouse one.
  if not app_private.can_manage_org(v_receipt.organization_id) then
    raise exception 'Only an owner or a manager can void a receipt.' using errcode = '42501';
  end if;
  if v_receipt.voided_at is not null then
    raise exception 'That receipt is already void.' using errcode = '55000';
  end if;

  update public.sales_receipts
  set voided_at = now(),
      voided_by = (select auth.uid()),
      void_reason = btrim(p_reason)
  where id = v_receipt.id;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, new_record)
  values (
    v_receipt.organization_id, (select auth.uid()), 'receipt.voided', 'sales_receipts', v_receipt.id::text,
    jsonb_build_object('saleId', v_receipt.sale_id, 'receiptNumber', v_receipt.receipt_number, 'reason', btrim(p_reason))
  );

  return jsonb_build_object('receiptId', v_receipt.id, 'receiptNumber', v_receipt.receipt_number, 'voided', true);
end;
$$;

-- sales_receipts carries voided_at, voided_by and void_reason, but the shared
-- immutability trigger blocked every update, so a receipt could never be voided.
-- This replacement keeps the record immutable apart from those three fields.
create or replace function app_private.protect_sales_receipt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Sales receipts are immutable; void the receipt instead.' using errcode = '55000';
  end if;
  if old.voided_at is not null then
    raise exception 'That receipt is already void.' using errcode = '55000';
  end if;
  if new.voided_at is null or new.voided_by is null then
    raise exception 'Sales receipts are immutable; only voiding is allowed.' using errcode = '55000';
  end if;
  if (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason')
    is distinct from (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason') then
    raise exception 'Only the void fields of a sales receipt may change.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists immutable_sales_receipts on public.sales_receipts;
create trigger immutable_sales_receipts
  before update or delete on public.sales_receipts
  for each row execute function app_private.protect_sales_receipt();

revoke all on function public.record_sale_payment(uuid, numeric, text, timestamptz, text, text, uuid) from public, anon;
revoke all on function public.issue_sales_receipt(uuid, jsonb, text) from public, anon;
revoke all on function public.void_sales_receipt(uuid, text) from public, anon;

grant execute on function public.record_sale_payment(uuid, numeric, text, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.issue_sales_receipt(uuid, jsonb, text) to authenticated;
grant execute on function public.void_sales_receipt(uuid, text) to authenticated;

commit;
