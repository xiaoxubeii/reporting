-- Per-fund operator policy for the bounded live Search product.
-- The Search feature switch itself remains disabled by default in application code.
alter table public.fund_settings
  add column if not exists search_source_config jsonb not null default
    '{"web":true,"specialized":{"pubmed":true,"clinical_trials":true,"fda":true,"tctmd":false,"massdevice":false}}'::jsonb;

alter table public.fund_settings
  drop constraint if exists fund_settings_search_source_config_object;

alter table public.fund_settings
  add constraint fund_settings_search_source_config_object
  check (
    jsonb_typeof(search_source_config) = 'object'
    and search_source_config ?& array['web', 'specialized']
    and search_source_config - array['web', 'specialized'] = '{}'::jsonb
    and jsonb_typeof(search_source_config -> 'web') = 'boolean'
    and jsonb_typeof(search_source_config -> 'specialized') = 'object'
    and (search_source_config -> 'specialized') ?&
      array['pubmed', 'clinical_trials', 'fda', 'tctmd', 'massdevice']
    and (search_source_config -> 'specialized') -
      array['pubmed', 'clinical_trials', 'fda', 'tctmd', 'massdevice'] = '{}'::jsonb
    and jsonb_typeof(search_source_config #> '{specialized,pubmed}') = 'boolean'
    and jsonb_typeof(search_source_config #> '{specialized,clinical_trials}') = 'boolean'
    and jsonb_typeof(search_source_config #> '{specialized,fda}') = 'boolean'
    and jsonb_typeof(search_source_config #> '{specialized,tctmd}') = 'boolean'
    and jsonb_typeof(search_source_config #> '{specialized,massdevice}') = 'boolean'
  );

comment on column public.fund_settings.search_source_config is
  'Operator-owned per-fund Search source policy. Endpoints, engines, selectors, and limits are never stored here.';
