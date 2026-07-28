import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260727010000_atomic_deal_promotion.sql'),
  'utf8',
)
const route = readFileSync(
  resolve(process.cwd(), 'app/api/deals/[id]/promote-to-diligence/route.ts'),
  'utf8',
)

describe('atomic Deal to Diligence promotion', () => {
  it('serializes one promotion per inbound Deal inside the database transaction', () => {
    expect(migration).toMatch(/create or replace function public\.promote_inbound_deal_to_diligence/i)
    expect(migration).toMatch(/pg_advisory_xact_lock/i)
    expect(migration).toMatch(/for update/i)
    expect(migration).toMatch(/security definer/i)
    expect(migration).toMatch(/grant execute on function public\.promote_inbound_deal_to_diligence[^;]+to service_role/i)
  })

  it('routes promotion through the atomic RPC instead of separate insert and update calls', () => {
    expect(route).toContain(".rpc('promote_inbound_deal_to_diligence'")
    expect(route).not.toContain(".from('diligence_deals')\n    .insert(")
  })
})
