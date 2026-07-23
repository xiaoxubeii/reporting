alter table public.fund_settings
  add column if not exists openrouter_request_parameters jsonb not null default '{}'::jsonb;

alter table public.fund_settings
  drop constraint if exists fund_settings_openrouter_request_parameters_object;

alter table public.fund_settings
  add constraint fund_settings_openrouter_request_parameters_object
  check (jsonb_typeof(openrouter_request_parameters) = 'object');

-- Preserve legacy OpenRouter rows that relied on runtime defaults so the
-- generic Custom Provider remains selectable after this migration.
update public.fund_settings
set
  openrouter_base_url = coalesce(openrouter_base_url, 'https://openrouter.ai/api/v1'),
  openrouter_model = coalesce(openrouter_model, 'openai/gpt-4o-mini')
where openrouter_api_key_encrypted is not null
  and (openrouter_base_url is null or openrouter_model is null);
