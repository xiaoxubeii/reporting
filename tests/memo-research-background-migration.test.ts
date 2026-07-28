import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  new URL('../supabase/migrations/20260728010000_memo_research_background_job.sql', import.meta.url),
  'utf8',
)
const LEGACY_WORKER = readFileSync(
  new URL('../app/api/cron/memo-agent-worker/route.ts', import.meta.url),
  'utf8',
)

describe('Memo Research background migration contract', () => {
  it('links the UI projection to one generalized background job', () => {
    expect(SQL).toMatch(/add column if not exists background_job_id uuid/i)
    expect(SQL).toMatch(/references public\.background_jobs\(id\) on delete restrict/i)
    expect(SQL).toMatch(/create unique index[\s\S]*memo_agent_jobs[\s\S]*background_job_id/i)
    expect(SQL).toMatch(/create unique index if not exists memo_agent_jobs_one_active_per_deal_idx[\s\S]*where status in \('pending', 'running'\) and background_job_id is not null/i)
    expect(SQL).not.toMatch(/where status in \('pending', 'running'\);/i)
  })

  it('atomically validates and enqueues both records for the same actor and fund', () => {
    const enqueue = functionBody('memo_agent_enqueue_research_background')
    expect(enqueue).toMatch(/for update/i)
    expect(enqueue).toMatch(/memo_research_actor_authorized\(p_fund_id, p_actor_user_id\)/i)
    expect(enqueue).toMatch(/from public\.diligence_memo_drafts[\s\S]*ingestion_output is not null/i)
    expect(enqueue).toMatch(/insert into public\.memo_agent_jobs/i)
    expect(enqueue).toMatch(/insert into public\.background_jobs/i)
    expect(enqueue).toMatch(/jsonb_build_object\([\s\S]*'memoJobId'[\s\S]*'dealId'[\s\S]*'draftId'/i)
    expect(enqueue).toMatch(/actor_type, actor_user_id[\s\S]*'user',[\s\S]*p_actor_user_id/i)
  })

  it('authorizes the worker with Diligence only so no-Search fallback can still run', () => {
    const authorization = functionBody('memo_research_actor_authorized')
    expect(authorization).toMatch(/feature_visibility->>'diligence'/i)
    expect(authorization).toMatch(/diligence_access[\s\S]*level[\s\S]*write/i)
    expect(authorization).not.toMatch(/feature_visibility->>'search'/i)
    expect(authorization).not.toMatch(/dealflow_access/i)
  })

  it('fences progress and terminal success by the active leased attempt', () => {
    for (const name of ['memo_research_update_progress', 'memo_research_write_result']) {
      const body = functionBody(name)
      expect(body).toMatch(/jobs\.attempt_id = p_attempt_id/i)
      expect(body).toMatch(/jobs\.status = 'running'/i)
      expect(body).toMatch(/jobs\.lease_expires_at > now\(\)/i)
      expect(body).toMatch(/jobs\.worker_claimed_attempt_id = p_attempt_id/i)
      expect(body).toMatch(/memo_research_actor_authorized\(jobs\.fund_id, jobs\.actor_user_id\)/i)
      expect(body).toMatch(/jobs\.payload->>'memoJobId' = p_memo_job_id::text/i)
      expect(body).toMatch(/memo\.background_job_id = jobs\.id/i)
      expect(body).toMatch(/memo\.fund_id = jobs\.fund_id/i)
    }
    expect(functionBody('memo_research_write_result')).toMatch(/update public\.background_jobs[\s\S]*status = 'completed'/i)
  })

  it('projects terminal generic failure and prevents the legacy worker from claiming linked work', () => {
    expect(SQL).toMatch(/function public\.background_job_project_memo_research_failure/i)
    expect(SQL).toMatch(/new\.kind = 'memo_research'[\s\S]*new\.status in \('failed', 'cancelled'\)/i)
    expect(SQL).toMatch(/update public\.memo_agent_jobs[\s\S]*background_job_id = new\.id/i)
    const claim = functionBody('memo_agent_claim_next_job')
    expect(claim).toMatch(/background_job_id is null/i)
    expect(claim).toMatch(/for update skip locked/i)
    expect(LEGACY_WORKER).toMatch(/eq\('status', 'running'\)[\s\S]*?is\('external_job_id', null\)[\s\S]*?is\('background_job_id', null\)[\s\S]*?lt\('started_at', staleCutoff\)/)
  })

  it('keeps all privileged RPCs service-only with a fixed search path', () => {
    for (const name of [
      'memo_agent_enqueue_research_background',
      'memo_research_update_progress',
      'memo_research_write_result',
    ]) {
      expect(SQL).toMatch(new RegExp(`function public\\.${name}[\\s\\S]{0,260}security definer[\\s\\S]{0,120}set search_path = ''`, 'i'))
      expect(SQL).toMatch(new RegExp(`revoke all on function public\\.${name}[\\s\\S]{0,280}from public, anon, authenticated`, 'i'))
      expect(SQL).toMatch(new RegExp(`grant execute on function public\\.${name}[\\s\\S]{0,280}to service_role`, 'i'))
    }
  })

  it('makes the link immutable and removes broad client-side job mutation', () => {
    expect(SQL).toMatch(/memo_agent_jobs_validate_background_link[\s\S]*old\.background_job_id is not null[\s\S]*background link is immutable/i)
    expect(SQL).toMatch(/jobs\.kind = 'memo_research'[\s\S]*jobs\.fund_id = new\.fund_id[\s\S]*jobs\.payload->>'memoJobId' = new\.id::text/i)
    expect(SQL).toMatch(/update of background_job_id, fund_id, deal_id, draft_id, id/i)
    expect(SQL).toMatch(/new\.fund_id is distinct from old\.fund_id[\s\S]*new\.deal_id is distinct from old\.deal_id[\s\S]*new\.draft_id is distinct from old\.draft_id/i)
    expect(SQL).toMatch(/drop policy if exists memo_agent_jobs_insert/i)
    expect(SQL).toMatch(/drop policy if exists memo_agent_jobs_update/i)
    expect(SQL).toMatch(/revoke insert, update, delete on public\.memo_agent_jobs from anon, authenticated/i)
  })

  it('does not block a running ingest job from queuing its legacy continuation', () => {
    expect(SQL).toMatch(/memo_agent_jobs_one_active_per_deal_idx[\s\S]*background_job_id is not null/i)
    const enqueue = functionBody('memo_agent_enqueue_research_background')
    expect(enqueue).toMatch(/where deal_id = p_deal_id[\s\S]*status in \('pending', 'running'\)/i)
  })

  it('serializes active inserts and rejects only generalized-to-legacy overlap', () => {
    const guard = functionBody('memo_agent_jobs_validate_background_link')
    expect(guard).toMatch(/pg_advisory_xact_lock\(hashtextextended\(new\.deal_id::text, 0\)\)/i)
    expect(guard).toMatch(/other\.status in \('pending', 'running'\)[\s\S]*new\.background_job_id is not null or other\.background_job_id is not null/i)
    expect(SQL).toMatch(/update of background_job_id, fund_id, deal_id, draft_id, id, status/i)
  })
})

function functionBody(name: string): string {
  return SQL.match(new RegExp(`function public\\.${name}[\\s\\S]*?\\n\\$\\$;`, 'i'))?.[0] ?? ''
}
