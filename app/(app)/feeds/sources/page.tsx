import { Suspense } from 'react'
import type { Metadata } from 'next'
import { FollowSources } from '@/components/feeds/follow-sources'

export const metadata: Metadata = { title: 'Follow sources · Feeds' }

export default function FollowSourcesPage() {
  return <Suspense><FollowSources /></Suspense>
}
