import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  new URL('../supabase/migrations/20260727020000_diligence_decision_integrity.sql', import.meta.url),
  'utf8',
)
const ROUTE = readFileSync(
  new URL('../app/api/diligence/[id]/route.ts', import.meta.url),
  'utf8',
)
const DATABASE_TYPES = readFileSync(
  new URL('../lib/types/database.ts', import.meta.url),
  'utf8',
)
const PATCH_ROUTE = ROUTE.slice(
  ROUTE.indexOf('export async function PATCH'),
  ROUTE.indexOf('export async function DELETE'),
)

describe('Diligence final-decision integrity', () => {
  it('makes generated memo drafts read-only to authenticated users while preserving service jobs', () => {
    expect(SQL).toMatch(/drop policy if exists diligence_memo_drafts_all on public\.diligence_memo_drafts/i)
    expect(SQL).toMatch(/drop policy if exists diligence_memo_drafts_select on public\.diligence_memo_drafts/i)
    expect(SQL).toMatch(/create policy diligence_memo_drafts_select[\s\S]*for select[\s\S]*get_my_fund_ids/i)
    expect(SQL).toMatch(/revoke insert, update, delete on table public\.diligence_memo_drafts\s+from [^;]*authenticated/i)
    expect(SQL).toMatch(/grant select, insert, update, delete on table public\.diligence_memo_drafts to service_role/i)
  })

  it('restricts direct Deal writes to Fund admins', () => {
    expect(SQL).toMatch(/drop policy if exists diligence_deals_(?:insert|update|delete)/i)
    expect(SQL).toMatch(/drop policy if exists diligence_deals_insert_admin/i)
    expect(SQL).toMatch(/drop policy if exists diligence_deals_update_admin/i)
    expect(SQL).toMatch(/drop policy if exists diligence_deals_delete_admin/i)
    expect(SQL).toMatch(/create policy diligence_deals_insert_admin[\s\S]*is_fund_admin/i)
    expect(SQL).toMatch(/create policy diligence_deals_update_admin[\s\S]*is_fund_admin/i)
    expect(SQL).toMatch(/create policy diligence_deals_delete_admin[\s\S]*is_fund_admin/i)
  })

  it('enforces final-state transitions in a database trigger', () => {
    expect(SQL).toMatch(/create or replace function public\.enforce_diligence_final_decision_integrity/i)
    expect(SQL).toMatch(/old\.deal_status[\s\S]*new\.deal_status/i)
    expect(SQL).toMatch(/members\.role = 'admin'/i)
    expect(SQL).toMatch(/drafts\.is_draft = false/i)
    expect(SQL).toMatch(/drafts\.finalized_at is not null/i)
    expect(SQL).toMatch(/drafts\.finalized_by is not null/i)
    expect(SQL).toMatch(/limit 1\s+for share/i)
    expect(SQL).toMatch(/before insert or update of deal_status on public\.diligence_deals/i)
  })

  it('records status through one actor-bound atomic RPC and keeps it service-only', () => {
    expect(SQL).toMatch(/create or replace function public\.set_diligence_deal_status/i)
    expect(SQL).toMatch(/security definer/i)
    expect(SQL).toMatch(/pg_advisory_xact_lock/i)
    expect(SQL).toMatch(/for update/i)
    expect(SQL).toMatch(/members\.user_id = p_actor_user_id/i)
    expect(SQL).toMatch(/set_config\(\s*'app\.diligence_decision_actor'/i)
    expect(SQL).toMatch(/revoke all on function public\.set_diligence_deal_status\(uuid, uuid, uuid, text\)\s+from public, anon, authenticated/i)
    expect(SQL).toMatch(/grant execute on function public\.set_diligence_deal_status\(uuid, uuid, uuid, text\)\s+to service_role/i)
    expect(DATABASE_TYPES).toMatch(/set_diligence_deal_status:[\s\S]*p_actor_user_id: string[\s\S]*p_deal_id: string[\s\S]*p_fund_id: string[\s\S]*p_status: string/)
  })

  it('routes every Deal status mutation through the atomic RPC', () => {
    expect(ROUTE).toContain(".rpc('set_diligence_deal_status'")
    expect(PATCH_ROUTE).not.toContain(".from('diligence_memo_drafts')")
    expect(PATCH_ROUTE).not.toMatch(/\.update\(updates\)[\s\S]{0,180}deal_status/)
  })
})
