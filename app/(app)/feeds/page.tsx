import { Suspense } from 'react'
import type { Metadata } from 'next'
import { TodayFeed } from '@/components/feeds/today-feed'
import { FeedRowsSkeleton } from '@/components/feeds/state-panel'

export const metadata: Metadata = { title: 'Today · Feeds' }

export default function FeedsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 md:px-8"><FeedRowsSkeleton /></div>}>
      <TodayFeed />
    </Suspense>
  )
}
