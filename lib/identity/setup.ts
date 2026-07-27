import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { identityStorageError } from './errors'

export interface FundSetupStep {
  key: 'profile' | 'mailbox' | 'branding' | 'email' | 'members'
  complete: boolean
  optional: boolean
  href: string
}

export interface FundSetupState {
  fund: {
    id: string
    name: string
    slug: string
    emailSubdomain: string | null
  }
  steps: FundSetupStep[]
  completeCount: number
  totalCount: number
}

export async function loadFundSetupState(
  admin: SupabaseClient<Database>,
  params: { fundId: string; userId: string },
): Promise<FundSetupState> {
  const [
    fundResult,
    profileResult,
    mailboxResult,
    settingsResult,
    providerResult,
    memberResult,
    invitationResult,
  ] = await Promise.all([
    admin.from('funds')
      .select('id,name,slug,email_subdomain,logo_url')
      .eq('id', params.fundId)
      .single(),
    admin.from('user_profiles').select('full_name').eq('user_id', params.userId).maybeSingle(),
    admin.from('fund_email_mailboxes')
      .select('id,active')
      .eq('fund_id', params.fundId)
      .eq('claimed_by_user_id', params.userId)
      .eq('kind', 'user')
      .maybeSingle(),
    admin.from('fund_settings')
      .select('outbound_email_provider,inbound_email_provider,resend_api_key_encrypted,postmark_inbound_address,mailgun_inbound_domain')
      .eq('fund_id', params.fundId)
      .maybeSingle(),
    admin.from('fund_email_provider_credentials')
      .select('sending_api_key_encrypted,receiving_api_key_encrypted,webhook_secret_encrypted')
      .eq('fund_id', params.fundId)
      .maybeSingle(),
    admin.from('fund_members').select('id', { count: 'exact', head: true }).eq('fund_id', params.fundId),
    admin.from('fund_member_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('fund_id', params.fundId)
      .not('delivery_confirmed_at', 'is', null)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .is('replaced_at', null)
      .gt('expires_at', new Date().toISOString()),
  ])

  if (
    fundResult.error
    || !fundResult.data
    || profileResult.error
    || mailboxResult.error
    || settingsResult.error
    || providerResult.error
    || memberResult.error
    || invitationResult.error
  ) throw identityStorageError()

  const fund = fundResult.data
  const settings = settingsResult.data
  const provider = providerResult.data
  const providerConfigured = Boolean(
    provider?.sending_api_key_encrypted
    || provider?.receiving_api_key_encrypted
    || settings?.resend_api_key_encrypted
    || settings?.postmark_inbound_address
    || settings?.mailgun_inbound_domain,
  )
  const steps: FundSetupStep[] = [
    {
      key: 'profile',
      complete: Boolean(profileResult.data?.full_name?.trim()),
      optional: false,
      href: '/settings/personal#profile',
    },
    {
      key: 'mailbox',
      complete: Boolean(mailboxResult.data?.active),
      optional: true,
      href: '/settings/personal#mailbox',
    },
    {
      key: 'branding',
      complete: Boolean(fund.logo_url),
      optional: true,
      href: '/settings#fund-branding',
    },
    {
      key: 'email',
      complete: providerConfigured,
      optional: true,
      href: '/settings#fund-email',
    },
    {
      key: 'members',
      complete: (memberResult.count ?? 0) > 1 || (invitationResult.count ?? 0) > 0,
      optional: true,
      href: '/settings#members',
    },
  ]
  return {
    fund: {
      id: fund.id,
      name: fund.name,
      slug: fund.slug,
      emailSubdomain: fund.email_subdomain,
    },
    steps,
    completeCount: steps.filter(step => step.complete).length,
    totalCount: steps.length,
  }
}
