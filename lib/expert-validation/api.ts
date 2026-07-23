import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { assertDomainAccess, type GateResult } from '@/lib/access/gate'
import { ValidationError } from './validation'

export async function internalContext(need: 'read' | 'write'): Promise<
  { admin: ReturnType<typeof createAdminClient>; gate: GateResult } | NextResponse
> {
  const auth = createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const gate = await assertDomainAccess(admin, user.id, 'diligence', need)
  if (gate instanceof NextResponse) return gate
  return { admin, gate }
}

export async function readJson(req: NextRequest, maxBytes = 32_000): Promise<unknown> {
  const contentType = req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') throw new ValidationError('Content-Type must be application/json')
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > maxBytes) throw new ValidationError('Request body is too large')
  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new ValidationError('Request body is too large')
  try {
    return JSON.parse(text)
  } catch {
    throw new ValidationError('Request body must be valid JSON')
  }
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 })
  const message = error instanceof Error ? error.message : 'Internal error'
  if (/not found/i.test(message)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  console.error('[expert-validation] request failed:', message)
  return NextResponse.json({ error: 'Internal error' }, { status: 500 })
}

export async function assertDeal(admin: ReturnType<typeof createAdminClient>, fundId: string, dealId: string): Promise<boolean> {
  const { data } = await admin
    .from('diligence_deals')
    .select('id')
    .eq('id', dealId)
    .eq('fund_id', fundId)
    .maybeSingle()
  return Boolean(data)
}
