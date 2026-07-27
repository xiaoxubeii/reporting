'use client'

import Link from 'next/link'
import { Building2, UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export function SettingsScopeNavigation({
  current,
  isAdmin,
  fundName,
}: {
  current: 'personal' | 'fund'
  isAdmin: boolean
  fundName?: string | null
}) {
  const t = useTranslations('SettingsIdentity.navigation')
  const items = [
    {
      key: 'personal' as const,
      href: '/settings/personal',
      icon: UserRound,
      title: t('personal.title'),
      description: t('personal.description'),
      available: true,
    },
    {
      key: 'fund' as const,
      href: '/settings',
      icon: Building2,
      title: t('fund.title', { fundName: fundName || t('fund.fallback') }),
      description: isAdmin ? t('fund.description') : t('fund.memberDescription'),
      available: Boolean(fundName),
    },
  ]

  return (
    <nav aria-label={t('label')} className="grid gap-3 sm:grid-cols-2">
      {items.map(item => {
        const Icon = item.icon
        const content = (
          <>
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', current === item.key ? 'bg-foreground text-background' : 'bg-muted')}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.description}</span>
            </span>
          </>
        )
        const className = cn(
          'flex min-h-20 items-start gap-3 rounded-xl border p-4 text-left transition-colors',
          current === item.key ? 'border-foreground bg-muted/40' : 'hover:bg-muted/40',
          !item.available && 'cursor-not-allowed opacity-60',
        )
        return item.available ? (
          <Link key={item.key} href={item.href} className={className} aria-current={current === item.key ? 'page' : undefined}>
            {content}
          </Link>
        ) : (
          <div key={item.key} className={className} aria-disabled="true">{content}</div>
        )
      })}
    </nav>
  )
}
