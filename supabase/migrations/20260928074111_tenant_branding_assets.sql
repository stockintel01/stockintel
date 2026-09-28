begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-branding',
  'tenant-branding',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy tenant_branding_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tenant-branding'
    and app_private.subscription_is_active(app_private.storage_organization_id(name))
    and app_private.can_manage_org(app_private.storage_organization_id(name))
  );

create policy tenant_branding_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tenant-branding'
    and app_private.can_manage_org(app_private.storage_organization_id(name))
  )
  with check (
    bucket_id = 'tenant-branding'
    and app_private.subscription_is_active(app_private.storage_organization_id(name))
    and app_private.can_manage_org(app_private.storage_organization_id(name))
  );

create policy tenant_branding_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tenant-branding'
    and app_private.can_manage_org(app_private.storage_organization_id(name))
  );

commit;
