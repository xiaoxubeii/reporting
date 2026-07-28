-- Restore memo_agent_prompts as the single partner-authored guidance source.
-- Project analysis preferences are intentionally discarded rather than copied
-- into fund-level stage guidance.

alter table public.diligence_deals
  drop column if exists analysis_preferences;
