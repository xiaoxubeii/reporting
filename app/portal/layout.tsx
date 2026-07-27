import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getPortalFund } from '@/lib/portal-fund'
import { themeCssVars } from '@/lib/theme'
import { PortalChrome } from '@/components/portal-chrome'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordPortalVisit } from '@/lib/lp-access-log'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTrustedRequestTenant } from '@/lib/tenancy/request'
import { selectPortalBranding } from '@/lib/tenancy/portal-branding'
import type { FundTheme } from '@/lib/theme'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Portal')
  return { title: t('metadata.title') }
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const admin = createAdminClient()
  const [fund, t, tenant] = await Promise.all([
    getPortalFund(),
    getTranslations('Portal'),
    getTrustedRequestTenant(admin as never, new Headers(headers())),
  ])
  const selection = selectPortalBranding(
    tenant ? { ...tenant, theme: tenant.theme as FundTheme | null } : null,
    fund,
  )
  if (!selection.allowed) notFound()
  const branding = selection.branding
  const themeVars = themeCssVars(branding?.theme ?? null)
  const fundName = branding?.name ?? t('layout.fallbackFundName')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Best-effort login/session tracking (throttled to one event per 30 min).
  if (user && fund?.fundId) {
    await recordPortalVisit(admin, { userId: user.id, fundId: fund.fundId })
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {themeVars && <style dangerouslySetInnerHTML={{ __html: `:root{${themeVars}}` }} />}
      <PortalChrome fundName={fundName} logoUrl={branding?.logoUrl ?? null} userEmail={user?.email ?? ''}>
        {children}
      </PortalChrome>
    </div>
  )
}
