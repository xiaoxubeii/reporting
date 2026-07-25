import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  new URL('../supabase/migrations/20260725000000_background_job_http_context.sql', import.meta.url),
  'utf8',
)
const GENERALIZE_SQL = readFileSync(
  new URL('../supabase/migrations/20260725010000_generalize_background_job_dispatch.sql', import.meta.url),
  'utf8',
)
const PROCESS_DEAL = readFileSync(
  new URL('../lib/pipeline/processDeal.ts', import.meta.url),
  'utf8',
)
const DATABASE_TYPES = readFileSync(
  new URL('../lib/types/database.ts', import.meta.url),
  'utf8',
)

describe('background job migration security contract', () => {
  it('keeps jobs and tool-call cache service-owned', () => {
    for (const table of ['background_jobs', 'background_job_tool_calls']) {
      expect(SQL).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
      expect(SQL).toMatch(new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'))
      expect(SQL).toMatch(new RegExp(`grant (?:select, insert, update, delete|all) on public\\.${table} to service_role`, 'i'))
    }
    expect(SQL).not.toMatch(/create policy[\s\S]{0,200}background_jobs/i)
  })

  it('enforces the user/system actor union and bounded lifecycle', () => {
    expect(SQL).toMatch(/actor_type text not null[\s\S]*actor_user_id uuid references auth\.users/i)
    expect(SQL).toMatch(/actor_type = 'user'[\s\S]*actor_user_id is not null/i)
    expect(SQL).toMatch(/actor_type = 'system'[\s\S]*actor_user_id is null/i)
    expect(SQL).toMatch(/status in \('pending', 'running', 'completed', 'failed', 'cancelled'\)/i)
    expect(SQL).toMatch(/attempts >= 0[\s\S]*attempts <= 20/i)
    expect(SQL).toMatch(/worker_claimed_attempt_id uuid/i)
    expect(SQL).toMatch(/background_jobs_reject_immutable_update[\s\S]*new\.kind[\s\S]*new\.payload[\s\S]*new\.fund_id[\s\S]*new\.actor_type[\s\S]*new\.actor_user_id[\s\S]*new\.dedupe_key/i)
    expect(SQL).toMatch(/create trigger background_jobs_immutable_columns/i)
  })

  it('deduplicates only active work and fences attempts with leases', () => {
    expect(SQL).toMatch(/create unique index background_jobs_active_dedupe_idx[\s\S]*where status in \('pending', 'running'\)/i)
    expect(SQL).toMatch(/attempt_id uuid/i)
    expect(SQL).toMatch(/lease_expires_at timestamptz/i)
    expect(SQL).toMatch(/lease_seconds integer not null default 300/i)
    expect(SQL).toMatch(/for update skip locked/i)
    expect(SQL).toMatch(/status = 'running'[\s\S]*attempt_id = gen_random_uuid\(\)[\s\S]*lease_expires_at/i)
    expect(SQL).toMatch(/where id = p_job_id[\s\S]*and attempt_id = p_attempt_id[\s\S]*and status = 'running'/i)
    expect(SQL).toMatch(/v_job\.fund_id is distinct from p_fund_id/i)
    expect(SQL).toMatch(/v_job\.actor_type is distinct from p_actor_type/i)
    expect(SQL).toMatch(/v_job\.actor_user_id is distinct from p_actor_user_id/i)
    expect(SQL).toMatch(/v_job\.payload is distinct from p_payload/i)
  })

  it('claims all registered kinds under one global bound and keeps per-kind leases in the row', () => {
    for (const migration of [SQL, GENERALIZE_SQL]) {
      expect(migration).toMatch(/background_job_claim_due\([\s\S]*p_kinds text\[\][\s\S]*p_limit integer/i)
      expect(migration).toMatch(/where kind = any\(p_kinds\)[\s\S]*limit p_limit/i)
      expect(migration).toMatch(/lease_expires_at = now\(\) \+ make_interval\(secs => jobs\.lease_seconds\)/i)
    }
    expect(GENERALIZE_SQL).toMatch(/add column if not exists lease_seconds/i)
    expect(GENERALIZE_SQL).toMatch(/new\.lease_seconds is distinct from old\.lease_seconds/i)
    expect(DATABASE_TYPES).toMatch(/background_job_claim_due:[\s\S]*Args: \{ p_kinds: string\[\]; p_limit\?: number \}/)
    expect(DATABASE_TYPES).toMatch(/background_jobs:[\s\S]*lease_seconds: number[\s\S]*worker_claimed_attempt_id: string \| null/)
  })

  it('makes service-only RPCs explicit instead of relying on default grants', () => {
    for (const fn of [
      'background_job_enqueue',
      'background_job_claim_due',
      'background_job_finalize',
      'background_job_claim_worker_attempt',
      'background_job_claim_tool_call',
      'background_job_complete_tool_call',
      'background_job_write_deal_research',
    ]) {
      expect(SQL).toMatch(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,240}from public, anon, authenticated`, 'i'))
      expect(SQL).toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,240}to service_role`, 'i'))
    }
  })

  it('atomically permits only one HTTP worker invocation per active attempt', () => {
    expect(SQL).toMatch(/function public\.background_job_claim_worker_attempt/i)
    expect(SQL).toMatch(/worker_claimed_attempt_id is distinct from p_attempt_id/i)
    expect(SQL).toMatch(/status = 'running'[\s\S]*lease_expires_at > now\(\)/i)
  })

  it('binds tool-call idempotency to job, attempt, name, id, and request hash', () => {
    expect(SQL).toMatch(/create table public\.background_job_tool_calls[\s\S]*job_id uuid not null[\s\S]*attempt_id uuid not null[\s\S]*tool_name text not null[\s\S]*tool_call_id text not null[\s\S]*request_hash text not null/i)
    expect(SQL).toMatch(/unique \(job_id, attempt_id, tool_name, tool_call_id\)/i)
    expect(SQL).toMatch(/request_hash = p_request_hash/i)
    expect(SQL).toMatch(/count\(\*\)[\s\S]*p_max_calls/i)
    const completeToolCall = SQL.match(/function public\.background_job_complete_tool_call[\s\S]*?\n\$\$;/i)?.[0] ?? ''
    expect(completeToolCall).toMatch(/from public\.background_jobs as jobs/i)
    expect(completeToolCall).toMatch(/jobs\.attempt_id = calls\.attempt_id/i)
    expect(completeToolCall).toMatch(/jobs\.status = 'running'[\s\S]*jobs\.lease_expires_at > now\(\)/i)
  })

  it('prevents expired attempts from finalizing lifecycle state', () => {
    for (const migration of [SQL, GENERALIZE_SQL]) {
      const finalize = migration.match(/function public\.background_job_finalize[\s\S]*?\n\$\$;/i)?.[0] ?? ''
      expect(finalize).toMatch(/attempt_id = p_attempt_id[\s\S]*status = 'running'[\s\S]*lease_expires_at > now\(\)/i)
    }
  })

  it('fences Deal Research projections and final writes by the active leased attempt', () => {
    expect(SQL).toMatch(/function public\.background_job_write_deal_research/i)
    expect(SQL).toMatch(/jobs\.attempt_id = p_attempt_id/i)
    expect(SQL).toMatch(/jobs\.status = 'running'/i)
    expect(SQL).toMatch(/jobs\.lease_expires_at > now\(\)/i)
    expect(SQL).toMatch(/jobs\.payload->>'dealId' = p_deal_id::text/i)
    expect(SQL).toMatch(/jobs\.fund_id = deals\.fund_id/i)
    expect(SQL).toMatch(/jobs\.actor_type = 'system'[\s\S]*jobs\.actor_user_id is null/i)
    expect(SQL).toMatch(/jobs\.actor_type = 'user'[\s\S]*from public\.fund_members/i)
  })

  it('repairs the Deal projection when a job terminally fails before or during the worker', () => {
    expect(SQL).toMatch(/function public\.background_job_project_deal_research_failure[\s\S]*new\.kind = 'deal_research'[\s\S]*new\.status in \('failed', 'cancelled'\)[\s\S]*update public\.inbound_deals/i)
    expect(SQL).toMatch(/create trigger background_job_project_deal_research_failure[\s\S]*after update of status on public\.background_jobs/i)
    expect(SQL).toMatch(/deals\.fund_id = new\.fund_id[\s\S]*deals\.id::text = new\.payload->>'dealId'/i)
    expect(SQL).toMatch(/deals\.research_status in \('pending', 'running'\)/i)
    expect(GENERALIZE_SQL).toMatch(/drop trigger if exists background_job_project_deal_research_failure[\s\S]*create trigger background_job_project_deal_research_failure/i)
  })

  it('keeps generic claim and finalize lifecycle free of Deal-specific projections', () => {
    for (const migration of [SQL, GENERALIZE_SQL]) {
      const claim = migration.match(/function public\.background_job_claim_due[\s\S]*?\n\$\$;/i)?.[0] ?? ''
      expect(claim).not.toContain('inbound_deals')
      expect(claim).not.toContain("kind = 'deal_research'")
    }
    for (const migration of [SQL, GENERALIZE_SQL]) {
      const finalize = migration.match(/function public\.background_job_finalize[\s\S]*?\n\$\$;/i)?.[0] ?? ''
      expect(finalize).not.toContain('inbound_deals')
      expect(finalize).not.toContain("kind = 'deal_research'")
    }
  })

  it('backfills legacy queued Deal Research as system jobs without choosing a member', () => {
    expect(SQL).toMatch(/insert into public\.background_jobs[\s\S]*'deal_research'[\s\S]*jsonb_build_object\('dealId', d\.id\)[\s\S]*'system'[\s\S]*from public\.inbound_deals d/i)
    expect(SQL).toMatch(/d\.research_status in \('pending', 'running'\)/i)
    expect(SQL).not.toMatch(/select[\s\S]{0,160}from public\.fund_members[\s\S]{0,160}background_jobs/i)
  })

  it('atomically creates automatic system jobs in the Deal insert transaction', () => {
    expect(SQL).toMatch(/function public\.background_job_enqueue_inserted_deal_research[\s\S]*new\.research_status = 'pending'[\s\S]*background_job_enqueue/i)
    expect(SQL).toMatch(/create trigger enqueue_inserted_deal_research[\s\S]*after insert on public\.inbound_deals/i)
    expect(PROCESS_DEAL).not.toMatch(/queueDealResearch/)
  })

  it('atomically rechecks Dealflow write and Search read before user-attributed writes', () => {
    expect(SQL).toMatch(/background_job_write_deal_research[\s\S]*feature_visibility->>'deals'[\s\S]*feature_visibility->>'search'/i)
    expect(SQL).toMatch(/fund_member_access[\s\S]*fund_domain_defaults/i)
    expect(SQL).toMatch(/members\.role = 'admin'[\s\S]*members\.role = 'member'[\s\S]*member_access\.level[\s\S]*domain_defaults\.level/i)
  })

  it('atomically records successful terminal Research before the HTTP response can be lost', () => {
    expect(SQL).toMatch(/background_job_write_deal_research[\s\S]*p_status in \('done', 'skipped'\)[\s\S]*update public\.background_jobs[\s\S]*status = 'completed'/i)
    expect(SQL).toMatch(/background_job_finalize[\s\S]*p_status = 'completed'[\s\S]*status = 'completed'[\s\S]*attempt_id = p_attempt_id/i)
  })
})
