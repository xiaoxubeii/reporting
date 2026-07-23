import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePageAccess, canViewPage } from '@/lib/access/page-gate'
import { LpActivityDashboard } from './lp-activity-dashboard'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('LPActivity.metadata')
  return { title: t('title') }
}

export default async function LpActivityPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const page = await resolvePageAccess(user.id)
  if (!page) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: rawFundSettings } = await admin
    .from('fund_settings')
    .select('lp_portal_enabled')
    .eq('fund_id', page.fundId)
    .maybeSingle()
  const fundSettings = rawFundSettings as unknown as { lp_portal_enabled: boolean } | null

  // Master switch off → the LP portal (and its activity log) is unavailable.
  if (!fundSettings?.lp_portal_enabled) redirect('/dashboard')

  // The fund's lp_activity switch AND this user's lp_relations grant.
  if (!canViewPage(page, 'lp_relations', 'lp_activity')) redirect('/dashboard')

  return <LpActivityDashboard />
}
