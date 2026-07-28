-- Serialize Deal -> Diligence promotion so retries and concurrent clicks can
-- never create multiple diligence records for one inbound Deal.

create or replace function public.promote_inbound_deal_to_diligence(
  p_deal_id uuid,
  p_fund_id uuid,
  p_user_id uuid
)
returns table(diligence_id uuid, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  source_deal public.inbound_deals%rowtype;
  new_diligence_id uuid;
  notes text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('deal-promotion:' || p_deal_id::text, 0)
  );

  select *
  into source_deal
  from public.inbound_deals
  where id = p_deal_id
    and fund_id = p_fund_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Inbound deal not found';
  end if;

  if source_deal.promoted_diligence_id is not null then
    return query select source_deal.promoted_diligence_id, false;
    return;
  end if;

  notes := pg_catalog.concat_ws(
    ' · ',
    case when source_deal.founder_name is not null then 'Founder: ' || source_deal.founder_name end,
    case when source_deal.intro_source is not null then
      'Intro: ' || pg_catalog.replace(source_deal.intro_source, '_', ' ')
      || case when source_deal.referrer_name is not null then ' via ' || source_deal.referrer_name else '' end
    end,
    'Promoted from inbound Deals.'
  );

  insert into public.diligence_deals (
    fund_id,
    name,
    sector,
    stage_at_consideration,
    deal_status,
    current_memo_stage,
    created_by,
    notes_summary
  ) values (
    p_fund_id,
    coalesce(source_deal.company_name, 'Untitled deal'),
    source_deal.industry,
    source_deal.stage,
    'active',
    'not_started',
    p_user_id,
    notes
  )
  returning id into new_diligence_id;

  update public.inbound_deals
  set promoted_diligence_id = new_diligence_id,
      status = 'diligence',
      updated_at = pg_catalog.now()
  where id = p_deal_id
    and fund_id = p_fund_id;

  return query select new_diligence_id, true;
end;
$$;

revoke all on function public.promote_inbound_deal_to_diligence(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.promote_inbound_deal_to_diligence(uuid, uuid, uuid) to service_role;
