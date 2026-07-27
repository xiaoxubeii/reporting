import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdminAccess } from '@/lib/api-helpers'
import { dbError } from '@/lib/api-error'

export async function PATCH() {
  return NextResponse.json(
    {
      error: 'Domain-based join approvals have been retired. Use exact-email invitations.',
      code: 'domain_join_retired',
    },
    { status: 410 },
  )
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const gate = await assertAdminAccess(admin, user.id)
  if (gate instanceof NextResponse) return gate

  const [{ data: target }, { data: fund }] = await Promise.all([
    admin.from('fund_members')
      .select('id,user_id,role')
      .eq('id', params.id)
      .eq('fund_id', gate.fundId)
      .maybeSingle(),
    admin.from('funds').select('created_by').eq('id', gate.fundId).single(),
  ])
  if (!target || !fund) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.user_id === user.id || target.user_id === fund.created_by) {
    return NextResponse.json({ error: 'The Fund founder cannot be removed.' }, { status: 400 })
  }
  if (target.role === 'admin') {
    return NextResponse.json({ error: 'Demote this administrator before removing them.' }, { status: 400 })
  }
  const { error } = await admin.from('fund_members').delete().eq('id', target.id).eq('fund_id', gate.fundId)
  if (error) return dbError(error, 'settings-members-delete')
  revalidateTag('membership')
  return NextResponse.json({ ok: true })
}
