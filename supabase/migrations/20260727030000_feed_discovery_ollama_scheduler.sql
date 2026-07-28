-- Keep the scheduler's eligibility contract aligned with the runtime resolver:
-- Ollama uses a validated endpoint/model and does not require an encrypted key.
begin;

create or replace function public.next_feed_discovery_funds(p_limit integer default 100)
returns table (fund_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cursor_id uuid;
  selected_ids uuid[];
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid Feed Discovery schedule limit';
  end if;

  insert into public.explore_discovery_schedule_state (scope)
  values ('public_explore')
  on conflict (scope) do nothing;

  select state.cursor_fund_id
    into cursor_id
    from public.explore_discovery_schedule_state as state
   where state.scope = 'public_explore'
   for update;

  with eligible as (
    select settings.fund_id
      from public.fund_settings as settings
     where case settings.default_ai_provider
       when 'anthropic' then settings.encryption_key_encrypted is not null
         and settings.claude_api_key_encrypted is not null
         and settings.claude_model is not null
       when 'openai' then settings.encryption_key_encrypted is not null
         and settings.openai_api_key_encrypted is not null
         and settings.openai_model is not null
       when 'gemini' then settings.encryption_key_encrypted is not null
         and settings.gemini_api_key_encrypted is not null
         and settings.gemini_model is not null
       when 'openrouter' then settings.encryption_key_encrypted is not null
         and settings.openrouter_api_key_encrypted is not null
         and settings.openrouter_model is not null
         and settings.openrouter_base_url is not null
       when 'ollama' then settings.ollama_base_url is not null
         and settings.ollama_model is not null
       else false
     end
  ), ordered as (
    select eligible.fund_id, 0 as segment
      from eligible
     where cursor_id is null or eligible.fund_id > cursor_id
    union all
    select eligible.fund_id, 1 as segment
      from eligible
     where cursor_id is not null and eligible.fund_id <= cursor_id
  ), selected as (
    select ordered.fund_id, ordered.segment
      from ordered
     order by ordered.segment, ordered.fund_id
     limit p_limit
  )
  select coalesce(array_agg(selected.fund_id order by selected.segment, selected.fund_id), '{}'::uuid[])
    into selected_ids
    from selected;

  update public.explore_discovery_schedule_state as state
     set cursor_fund_id = case
           when cardinality(selected_ids) = 0 then null
           else selected_ids[cardinality(selected_ids)]
         end,
         updated_at = now()
   where state.scope = 'public_explore';

  return query select unnest(selected_ids);
end;
$$;

revoke all on function public.next_feed_discovery_funds(integer) from public, anon, authenticated;
grant execute on function public.next_feed_discovery_funds(integer) to service_role;

commit;
