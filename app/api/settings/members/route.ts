import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveFund } from '@/lib/api-helpers'
import { deriveFundEmailDomain } from '@/lib/email/domain'
import { listFundInvitations } from '@/lib/identity/invitations'
import { identityErrorResponse } from '@/lib/identity/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const gate = await resolveFund(admin, user.id)
  if (gate instanceof NextResponse) return gate
  const isAdmin = gate.role === 'admin'

  const [{ data: fund, error: fundError }, { data: members, error: memberError }] = await Promise.all([
    admin.from('funds').select('created_by,email_subdomain').eq('id', gate.fundId).single(),
    admin.from('fund_members')
      .select('id,user_id,role,created_at')
      .eq('fund_id', gate.fundId)
      .order('created_at'),
  ])
  if (fundError || !fund || memberError) {
    return NextResponse.json({ error: 'Unable to load Fund members.' }, { status: 503 })
  }

  const userIds = (members ?? []).map(member => member.user_id)
  const [{ data: profiles }, { data: mailboxes }] = await Promise.all([
    userIds.length
      ? admin.from('user_profiles').select('user_id,full_name').in('user_id', userIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? admin.from('fund_email_mailboxes')
        .select('claimed_by_user_id,local_part,active')
        .eq('fund_id', gate.fundId)
        .eq('kind', 'user')
        .in('claimed_by_user_id', userIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  const profileByUser = new Map((profiles ?? []).map(profile => [profile.user_id, profile.full_name]))
  const mailboxByUser = new Map((mailboxes ?? []).map(mailbox => [mailbox.claimed_by_user_id, mailbox]))
  const emailDomain = fund.email_subdomain ? deriveFundEmailDomain(fund.email_subdomain) : null

  const memberList = await Promise.all((members ?? []).map(async member => {
    const mailbox = mailboxByUser.get(member.user_id)
    const common = {
      id: member.id,
      userId: member.user_id,
      name: profileByUser.get(member.user_id) ?? null,
      role: member.role,
      isFounder: member.user_id === fund.created_by,
      businessEmail: mailbox && emailDomain ? `${mailbox.local_part}@${emailDomain}` : null,
      mailboxActive: mailbox?.active ?? false,
      createdAt: member.created_at,
    }
    if (!isAdmin) return common
    const { data } = await admin.auth.admin.getUserById(member.user_id)
    return { ...common, externalEmail: data?.user?.email ?? null }
  }))

  try {
    return NextResponse.json({
      members: memberList,
      invitations: isAdmin ? await listFundInvitations(admin, gate.fundId) : [],
      isAdmin,
      isFounder: user.id === fund.created_by,
    })
  } catch (error) {
    return identityErrorResponse(error, 'settings-members')
  }
}
