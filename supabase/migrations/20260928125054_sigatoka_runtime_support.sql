begin;

alter table public.sigatoka_observations add column archive_batch_id uuid;

create or replace function public.save_sigatoka_observation(
  p_organization_id uuid,
  p_sheet jsonb,
  p_observation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observation_id uuid := coalesce(p_observation_id, gen_random_uuid());
  v_plot_id uuid;
  v_plant jsonb;
  v_plant_row_id uuid;
  v_sentinel_id uuid;
  v_sentinel_code text;
  v_position integer;
  v_score jsonb;
  v_advanced jsonb;
  v_leaf jsonb;
  v_metrics jsonb := coalesce(p_sheet -> 'metrics', '{}'::jsonb);
  v_status public.record_status := coalesce(nullif(p_sheet ->> 'status', ''), 'draft')::public.record_status;
begin
  if not app_private.subscription_is_active(p_organization_id)
    or not app_private.has_any_permission(p_organization_id, array['agricSigatoka']::public.app_permission[]) then
    raise exception 'You do not have permission to save disease scouting sheets.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_sheet) <> 'object' or jsonb_typeof(p_sheet -> 'plants') <> 'array'
    or jsonb_array_length(p_sheet -> 'plants') = 0 then
    raise exception 'A scouting sheet with sampled plants is required.' using errcode = '22023';
  end if;
  if v_status not in ('draft', 'submitted', 'verified') then
    raise exception 'Scouting status must be draft, submitted or verified.' using errcode = '22023';
  end if;

  insert into public.sigatoka_plots (
    organization_id, sector_name, name, area, area_square_metres, area_unit
  ) values (
    p_organization_id, btrim(p_sheet ->> 'sectorName'), btrim(p_sheet ->> 'plotName'),
    nullif(p_sheet ->> 'plotArea', '')::numeric, nullif(p_sheet ->> 'plotAreaSquareMetres', '')::numeric,
    nullif(btrim(p_sheet ->> 'areaUnit'), '')
  )
  on conflict (organization_id, sector_name, name) do update
    set area = coalesce(excluded.area, public.sigatoka_plots.area),
        area_square_metres = coalesce(excluded.area_square_metres, public.sigatoka_plots.area_square_metres),
        area_unit = coalesce(excluded.area_unit, public.sigatoka_plots.area_unit),
        active = true
  returning id into v_plot_id;

  if p_observation_id is not null then
    if not exists (
      select 1 from public.sigatoka_observations observation
      where observation.id = p_observation_id and observation.organization_id = p_organization_id
      for update
    ) then raise exception 'Scouting observation not found.' using errcode = 'P0002'; end if;
    delete from public.sigatoka_advanced_stage_counts where observation_id = p_observation_id;
    delete from public.sigatoka_plant_observations where observation_id = p_observation_id;
    update public.sigatoka_observations set
      plot_id = v_plot_id,
      observed_on = (p_sheet ->> 'observedAt')::date,
      monitoring_week = (p_sheet ->> 'monitoringWeek')::smallint,
      monitoring_year = (p_sheet ->> 'monitoringYear')::integer,
      observer_id = (select auth.uid()),
      observer_name = btrim(p_sheet ->> 'observerName'),
      interval_days = (p_sheet ->> 'intervalDays')::numeric,
      previous_final_fer = (v_metrics ->> 'previousFinalFer')::numeric,
      mean_raw_fer_override = nullif(p_sheet ->> 'meanRawFerOverride', '')::numeric,
      status = v_status,
      rainfall_mm = nullif(p_sheet ->> 'rainfallMm', '')::numeric,
      treatment = case when p_sheet -> 'treatment' in ('null'::jsonb, '{}'::jsonb) then null else p_sheet -> 'treatment' end,
      notes = nullif(btrim(p_sheet ->> 'notes'), ''),
      verified_by = case when v_status = 'verified' then (select auth.uid()) else null end,
      verified_at = case when v_status = 'verified' then now() else null end,
      calculation_version = coalesce(nullif(v_metrics ->> 'calculationVersion', ''), 'legacy-sed-v1'),
      mean_raw_fer = (v_metrics ->> 'meanRawFer')::numeric,
      fer_10d = (v_metrics ->> 'fer10d')::numeric,
      final_fer = (v_metrics ->> 'finalFer')::numeric,
      coefficient_leaf_2 = (v_metrics ->> 'coefficientLeaf2')::numeric,
      coefficient_leaf_3 = (v_metrics ->> 'coefficientLeaf3')::numeric,
      coefficient_leaf_4 = (v_metrics ->> 'coefficientLeaf4')::numeric,
      gross_coefficient = (v_metrics ->> 'grossCoefficient')::numeric,
      sed = (v_metrics ->> 'sed')::numeric,
      average_yil = nullif(v_metrics ->> 'averageYil', '')::numeric,
      average_ynl = nullif(v_metrics ->> 'averageYnl', '')::numeric,
      average_nlf = nullif(v_metrics ->> 'averageNlf', '')::numeric,
      average_nlh = nullif(v_metrics ->> 'averageNlh', '')::numeric,
      high_density_count = coalesce((v_metrics ->> 'highDensityCount')::integer, 0)
    where id = p_observation_id;
  else
    insert into public.sigatoka_observations (
      id, organization_id, plot_id, observed_on, monitoring_week, monitoring_year,
      observer_id, observer_name, interval_days, previous_final_fer, mean_raw_fer_override,
      status, rainfall_mm, treatment, notes, verified_by, verified_at, calculation_version,
      mean_raw_fer, fer_10d, final_fer, coefficient_leaf_2, coefficient_leaf_3,
      coefficient_leaf_4, gross_coefficient, sed, average_yil, average_ynl,
      average_nlf, average_nlh, high_density_count
    ) values (
      v_observation_id, p_organization_id, v_plot_id, (p_sheet ->> 'observedAt')::date,
      (p_sheet ->> 'monitoringWeek')::smallint, (p_sheet ->> 'monitoringYear')::integer,
      (select auth.uid()), btrim(p_sheet ->> 'observerName'), (p_sheet ->> 'intervalDays')::numeric,
      (v_metrics ->> 'previousFinalFer')::numeric, nullif(p_sheet ->> 'meanRawFerOverride', '')::numeric,
      v_status, nullif(p_sheet ->> 'rainfallMm', '')::numeric,
      case when p_sheet -> 'treatment' in ('null'::jsonb, '{}'::jsonb) then null else p_sheet -> 'treatment' end,
      nullif(btrim(p_sheet ->> 'notes'), ''),
      case when v_status = 'verified' then (select auth.uid()) else null end,
      case when v_status = 'verified' then now() else null end,
      coalesce(nullif(v_metrics ->> 'calculationVersion', ''), 'legacy-sed-v1'),
      (v_metrics ->> 'meanRawFer')::numeric, (v_metrics ->> 'fer10d')::numeric,
      (v_metrics ->> 'finalFer')::numeric, (v_metrics ->> 'coefficientLeaf2')::numeric,
      (v_metrics ->> 'coefficientLeaf3')::numeric, (v_metrics ->> 'coefficientLeaf4')::numeric,
      (v_metrics ->> 'grossCoefficient')::numeric, (v_metrics ->> 'sed')::numeric,
      nullif(v_metrics ->> 'averageYil', '')::numeric, nullif(v_metrics ->> 'averageYnl', '')::numeric,
      nullif(v_metrics ->> 'averageNlf', '')::numeric, nullif(v_metrics ->> 'averageNlh', '')::numeric,
      coalesce((v_metrics ->> 'highDensityCount')::integer, 0)
    );
  end if;

  for v_plant in select value from jsonb_array_elements(p_sheet -> 'plants') loop
    v_sentinel_code := coalesce(nullif(btrim(v_plant ->> 'sentinelPlantCode'), ''), 'PLANT-' || (v_plant ->> 'plantNumber'));
    select sentinel.id into v_sentinel_id from public.sigatoka_sentinel_plants sentinel
    where sentinel.plot_id = v_plot_id and sentinel.code = v_sentinel_code;
    if v_sentinel_id is null then
      insert into public.sigatoka_sentinel_plants (organization_id, plot_id, code, enrolled_on)
      values (p_organization_id, v_plot_id, v_sentinel_code, (p_sheet ->> 'observedAt')::date)
      returning id into v_sentinel_id;
    end if;
    insert into public.sigatoka_plant_observations (
      organization_id, observation_id, sentinel_plant_id, plant_number,
      previous_leaf_reading, current_leaf_reading, youngest_infested_leaf,
      youngest_necrotic_leaf, leaves_at_flowering, leaves_at_harvest, notes
    ) values (
      p_organization_id, v_observation_id, v_sentinel_id, (v_plant ->> 'plantNumber')::integer,
      (v_plant ->> 'previousLeafReading')::numeric, (v_plant ->> 'currentLeafReading')::numeric,
      nullif(v_plant ->> 'youngestInfestedLeaf', '')::numeric,
      nullif(v_plant ->> 'youngestNecroticLeaf', '')::numeric,
      nullif(v_plant ->> 'leavesAtFlowering', '')::numeric,
      nullif(v_plant ->> 'leavesAtHarvest', '')::numeric,
      nullif(btrim(v_plant ->> 'notes'), '')
    ) returning id into v_plant_row_id;
    for v_position in 2..4 loop
      v_score := v_plant -> ('leaf' || v_position::text);
      insert into public.sigatoka_leaf_scores (
        plant_observation_id, organization_id, leaf_position, disease_stage, density, coefficient
      ) values (
        v_plant_row_id, p_organization_id, v_position,
        nullif(v_score ->> 'stage', '')::smallint,
        nullif(v_score ->> 'density', ''), 0
      );
    end loop;
  end loop;

  v_advanced := p_sheet -> 'advancedStageObservation';
  if v_advanced is not null and v_advanced <> 'null'::jsonb then
    select plant.sentinel_plant_id into v_sentinel_id
    from public.sigatoka_plant_observations plant
    where plant.observation_id = v_observation_id
      and plant.plant_number = (v_advanced ->> 'plantNumber')::integer;
    if v_sentinel_id is null then raise exception 'The detailed stage plant is not part of this sheet.' using errcode = '23514'; end if;
    for v_leaf in select value from jsonb_array_elements(v_advanced -> 'leafCounts') loop
      insert into public.sigatoka_advanced_stage_counts (
        observation_id, organization_id, sentinel_plant_id, leaf_number,
        stage_4_count, stage_5_count, stage_6_count
      ) values (
        v_observation_id, p_organization_id, v_sentinel_id, (v_leaf ->> 'leafNumber')::smallint,
        nullif(v_leaf ->> 'stage4Count', '')::integer,
        nullif(v_leaf ->> 'stage5Count', '')::integer,
        nullif(v_leaf ->> 'stage6Count', '')::integer
      );
    end loop;
  end if;
  return v_observation_id;
end;
$$;

create or replace function public.manage_sigatoka_observation(
  p_observation_id uuid,
  p_action text,
  p_reason text default null,
  p_batch_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_observation public.sigatoka_observations%rowtype;
begin
  select * into v_observation from public.sigatoka_observations where id = p_observation_id for update;
  if not found then raise exception 'Scouting observation not found.' using errcode = 'P0002'; end if;
  if not app_private.can_manage_org(v_observation.organization_id) then
    raise exception 'Only an owner or manager can archive or delete scouting history.' using errcode = '42501';
  end if;
  if p_action not in ('archive', 'restore', 'permanent_delete') then raise exception 'Unsupported scouting action.' using errcode = '22023'; end if;
  if p_action <> 'restore' and char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Enter a clear reason for this action.' using errcode = '22023';
  end if;
  if p_action = 'archive' then
    update public.sigatoka_observations set archived_at = now(), archived_by = (select auth.uid()),
      archive_reason = btrim(p_reason), archive_batch_id = p_batch_id, purge_after = now() + interval '30 days'
    where id = v_observation.id;
  elsif p_action = 'restore' then
    update public.sigatoka_observations set archived_at = null, archived_by = null,
      archive_reason = null, archive_batch_id = null, purge_after = null
    where id = v_observation.id;
  else
    delete from public.sigatoka_observations where id = v_observation.id;
  end if;
  perform public.record_deletion_audit(
    v_observation.organization_id, 'sigatoka_observation', p_action,
    v_observation.id, null, p_reason, to_jsonb(v_observation) - 'legacy_firebase_id'
  );
end;
$$;

revoke all on function public.save_sigatoka_observation(uuid, jsonb, uuid) from public, anon;
revoke all on function public.manage_sigatoka_observation(uuid, text, text, uuid) from public, anon;
grant execute on function public.save_sigatoka_observation(uuid, jsonb, uuid) to authenticated;
grant execute on function public.manage_sigatoka_observation(uuid, text, text, uuid) to authenticated;

commit;
