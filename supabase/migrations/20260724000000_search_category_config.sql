-- Fund-scoped presentation and grouping for Search. Adapter implementations,
-- endpoints, credentials, selectors, and engines remain code-owned.
alter table public.fund_settings
  add column if not exists search_category_config jsonb not null default
  '{"version":1,"categories":[{"id":"personal-subscriptions","label":{"en":"Personal subscriptions","zh-CN":"个人订阅"},"description":{"en":"Search articles in your subscriptions","zh-CN":"搜索个人订阅中的文章"},"enabled":true,"defaultSelected":true,"adapterIds":["feeds"]},{"id":"internet","label":{"en":"Internet","zh-CN":"互联网"},"description":{"en":"Search the public web","zh-CN":"搜索公开互联网"},"enabled":true,"defaultSelected":true,"adapterIds":["web"]},{"id":"medical-literature","label":{"en":"Medical literature","zh-CN":"医学文献"},"description":{"en":"Search reviewed medical literature sources","zh-CN":"搜索专业医学文献来源"},"enabled":true,"defaultSelected":false,"adapterIds":["pubmed"]},{"id":"clinical-trials","label":{"en":"Clinical trials","zh-CN":"临床试验"},"description":{"en":"Search registered clinical studies","zh-CN":"搜索已注册临床研究"},"enabled":true,"defaultSelected":false,"adapterIds":["clinical_trials"]},{"id":"regulatory","label":{"en":"Medical regulatory","zh-CN":"医疗监管"},"description":{"en":"Search medical device regulatory records","zh-CN":"搜索医疗器械监管记录"},"enabled":true,"defaultSelected":false,"adapterIds":["fda"]}]}'::jsonb;

alter table public.fund_settings
  drop constraint if exists fund_settings_search_category_config_envelope;

alter table public.fund_settings
  add constraint fund_settings_search_category_config_envelope
  check (
    jsonb_typeof(search_category_config) = 'object'
    and search_category_config ?& array['version', 'categories']
    and search_category_config - array['version', 'categories'] = '{}'::jsonb
    and search_category_config -> 'version' = '1'::jsonb
    and jsonb_typeof(search_category_config -> 'categories') = 'array'
    and jsonb_array_length(search_category_config -> 'categories') between 1 and 20
  );

comment on column public.fund_settings.search_category_config is
  'Fund-admin-managed ordered Search category presentation and mappings to code-registered adapter IDs only.';
