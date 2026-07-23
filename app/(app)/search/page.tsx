import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { SearchPage, type SearchSourceOption } from '@/components/search/search-page'
import { canViewPage, resolvePageAccess } from '@/lib/access/page-gate'
import { FeedService } from '@/lib/feeds/service'
import { resolveSearchFeedStatus } from '@/lib/search/page-access'
import { SPECIALIZED_SOURCE_DESCRIPTORS } from '@/lib/search/provider-contracts'
import { checkSearxngAvailability, configuredSearxngUrl } from '@/lib/search/searxng/config'
import { loadSearchSourcePolicy } from '@/lib/search/source-policy'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SearchProduct')
  return { title: t('title') }
}

export default async function SearchRoutePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  const page = await resolvePageAccess(user.id)
  if (!page || !canViewPage(page, 'dealflow', 'search')) redirect('/dashboard')

  const admin = createAdminClient()
  const feedService = new FeedService(admin)
  const [policy, feedStatus, webAvailable, t] = await Promise.all([
    loadSearchSourcePolicy(admin, page.fundId),
    resolveSearchFeedStatus(page.access, user.id, feedService),
    liveWebAvailability(),
    getTranslations('SearchProduct'),
  ])
  const sources: readonly SearchSourceOption[] = Object.freeze([
    Object.freeze({
      id: 'feeds' as const,
      label: t('sourceLabels.feeds'),
      group: 'personal' as const,
      available: Boolean(feedStatus?.connected),
      ...(!feedStatus?.connected ? {
        reason: feedStatus === null
          ? t('sourceReasons.feedsUnavailable')
          : t('sourceReasons.feeds'),
      } : {}),
    }),
    ...SPECIALIZED_SOURCE_DESCRIPTORS.map(descriptor => Object.freeze({
      id: descriptor.id,
      label: descriptor.label,
      group: 'professional' as const,
      available: policy.specialized[descriptor.id] && descriptor.liveTransportAvailable,
      ...(!(policy.specialized[descriptor.id] && descriptor.liveTransportAvailable) ? {
        reason: !descriptor.liveTransportAvailable
          ? t('sourceReasons.siteApproval')
          : t('sourceReasons.fundDisabled'),
      } : {}),
    })),
    Object.freeze({
      id: 'web' as const,
      label: t('sourceLabels.web'),
      group: 'web' as const,
      available: policy.web && webAvailable,
      ...(!(policy.web && webAvailable) ? { reason: policy.web ? t('sourceReasons.web') : t('sourceReasons.fundDisabled') } : {}),
    }),
  ])

  return <SearchPage sources={sources} />
}

async function liveWebAvailability(): Promise<boolean> {
  try {
    const baseUrl = configuredSearxngUrl()
    return baseUrl ? checkSearxngAvailability(baseUrl) : false
  } catch {
    return false
  }
}
