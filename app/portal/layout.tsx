import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getPortalFund } from '@/lib/portal-fund'
import { themeCssVars } from '@/lib/theme'
import { PortalChrome } from '@/components/portal-chrome'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordPortalVisit } from '@/lib/lp-access-log'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Portal')
  return { title: t('metadata.title') }
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [fund, t] = await Promise.all([
    getPortalFund(),
    getTranslations('Portal'),
  ])
  const themeVars = themeCssVars(fund?.theme ?? null)
  const fundName = fund?.name ?? t('layout.fallbackFundName')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Best-effort login/session tracking (throttled to one event per 30 min).
  if (user && fund?.fundId) {
    await recordPortalVisit(createAdminClient(), { userId: user.id, fundId: fund.fundId })
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {themeVars && <style dangerouslySetInnerHTML={{ __html: `:root{${themeVars}}` }} />}
      <PortalChrome fundName={fundName} logoUrl={fund?.logoUrl ?? null} userEmail={user?.email ?? ''}>
        {children}
      </PortalChrome>
    </div>
  )
}
