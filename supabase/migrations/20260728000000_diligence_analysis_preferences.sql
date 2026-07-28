-- Project-level analysis preferences. These are deliberately separate from
-- fund-wide memo_agent_prompts: changing one diligence project's focus must
-- never alter how every other project is analyzed.

alter table diligence_deals
  add column if not exists analysis_preferences jsonb not null default '{"focus_areas":[],"depth":"standard","custom_instructions":""}'::jsonb;

alter table diligence_deals
  add constraint diligence_deals_analysis_preferences_object_check
  check (jsonb_typeof(analysis_preferences) = 'object');
