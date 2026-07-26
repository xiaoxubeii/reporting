import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  new URL('../supabase/migrations/20260726000000_diligence_output_language.sql', import.meta.url),
  'utf8',
)

describe('diligence output language migration', () => {
  it('adds bounded English-compatible deal and draft language columns', () => {
    expect(SQL).toMatch(/alter table diligence_deals[\s\S]*output_language text not null default 'en'/)
    expect(SQL).toMatch(/alter table diligence_memo_drafts[\s\S]*output_language text not null default 'en'/)
    expect(SQL.match(/output_language in \('en', 'zh-CN'\)/g)).toHaveLength(2)
    expect(SQL).toContain('checklist_assessment_output jsonb')
  })

  it('records non-self language-version lineage without cascading source deletion', () => {
    expect(SQL).toContain('source_draft_id uuid references diligence_memo_drafts(id) on delete set null')
    expect(SQL).toContain('source_draft_id is null or source_draft_id <> id')
    expect(SQL).toContain('diligence_memo_drafts_source_idx')
  })

  it('prevents generated or finalized draft snapshots from changing language', () => {
    expect(SQL).toContain('enforce_diligence_draft_output_language_snapshot')
    expect(SQL).toContain('old.is_draft = false')
    expect(SQL).toContain('old.ingestion_output is not null')
    expect(SQL).toContain('old.research_output is not null')
    expect(SQL).toContain('old.checklist_assessment_output is not null')
    expect(SQL).toContain("jsonb_array_length(coalesce(old.qa_answers, '[]'::jsonb)) > 0")
    expect(SQL).toContain('old.memo_draft_output is not null')
  })

  it('serializes version creation, blocks in-flight jobs, and exposes only a service-role RPC', () => {
    expect(SQL).toContain('change_diligence_output_language')
    expect(SQL).toContain('pg_advisory_xact_lock')
    expect(SQL).toContain("status in ('pending', 'running')")
    expect(SQL).toContain("'status', 'version_created'")
    expect(SQL).toContain('revoke all on function change_diligence_output_language(uuid, uuid, text, uuid, boolean, uuid) from public, anon, authenticated')
    expect(SQL).toContain('grant execute on function change_diligence_output_language(uuid, uuid, text, uuid, boolean, uuid) to service_role')
  })

  it('shares the per-deal lock with every memo-agent job enqueue', () => {
    expect(SQL).toContain('lock_diligence_job_enqueue')
    expect(SQL).toMatch(/before insert on memo_agent_jobs/)
    expect(SQL).toContain('pg_advisory_xact_lock(hashtextextended(new.deal_id::text, 0))')
  })

  it('requires server-authoritative confirmation bound to the latest draft', () => {
    expect(SQL).toContain('p_confirm_version boolean')
    expect(SQL).toContain('p_expected_draft_id uuid')
    expect(SQL).toContain('DILIGENCE_LANGUAGE_CONFIRMATION_REQUIRED')
    expect(SQL).toContain('DILIGENCE_LANGUAGE_VERSION_STALE')
  })
})
