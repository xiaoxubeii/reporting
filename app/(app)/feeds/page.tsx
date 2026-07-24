import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { TodayFeed } from '@/components/feeds/today-feed'
import { FeedRowsSkeleton } from '@/components/feeds/state-panel'

export async function generateMetadata() {
  const t = await getTranslations('Feeds.metadata')
  return { title: t('todayTitle') }
}

export default function FeedsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 md:px-8"><FeedRowsSkeleton /></div>}>
      <TodayFeed />
    </Suspense>
  )
}
