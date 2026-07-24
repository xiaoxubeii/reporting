import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { FollowSources } from '@/components/feeds/follow-sources'

export async function generateMetadata() {
  const t = await getTranslations('Feeds.metadata')
  return { title: t('sourcesTitle') }
}

export default function FollowSourcesPage() {
  return <Suspense><FollowSources /></Suspense>
}
