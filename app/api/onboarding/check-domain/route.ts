import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'
import { getTrustedRequestTenant } from '@/lib/tenancy/request'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const domain = user.email?.split('@')[1]?.toLowerCase()
  if (!domain) return NextResponse.json({ fund: null })

  const admin = createAdminClient()
  const tenant = await getTrustedRequestTenant(admin as never, new Headers(headers()))

  // Check if user already belongs to a fund — if so, don't suggest joining
  const { data: existing } = await admin
    .from('fund_members')
    .select('fund_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    if (tenant && existing.fund_id !== tenant.id) {
      return NextResponse.json({ error: 'Fund not found' }, { status: 404 })
    }
    return NextResponse.json({ fund: null })
  }

  let fundQuery = admin
    .from('funds')
    .select('id, name')
    .eq('email_domain', domain)
  if (tenant) fundQuery = fundQuery.eq('id', tenant.id)
  const { data: fund } = await fundQuery.limit(1).maybeSingle()

  return NextResponse.json({ fund: fund ?? null })
}
