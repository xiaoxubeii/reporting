import Link from 'next/link'
import React from 'react'
import { useTranslations } from 'next-intl'

export type ExploreView = 'latest' | 'trending' | 'deal_signal'

export function ExploreViewTabs({ active }: { active: ExploreView }) {
  const t = useTranslations('Feeds.discovery.tabs')
  const tabs: Array<{ value: ExploreView; href: string; label: string }> = [
    { value: 'latest', href: '/feeds?view=explore', label: t('latest') },
    { value: 'trending', href: '/feeds?view=explore&exploreView=trending', label: t('trending') },
    { value: 'deal_signal', href: '/feeds?view=explore&exploreView=deal_signal', label: t('dealSignals') },
  ]
  return (
    <nav className="mt-5 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1" aria-label={t('label')}>
      {tabs.map(tab => (
        <Link key={tab.value} href={tab.href} aria-current={active === tab.value ? 'page' : undefined} className={`min-h-9 shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-colors ${active === tab.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
