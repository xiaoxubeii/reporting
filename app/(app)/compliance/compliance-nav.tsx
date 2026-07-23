'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

const tabs = [
  { key: 'calendar' },
  { key: 'items' },
  { key: 'setup' },
  { key: 'links' },
] as const

export type ComplianceTab = (typeof tabs)[number]['key']

export function ComplianceNav({
  active,
  onSelect,
}: {
  active: ComplianceTab
  onSelect?: (tab: ComplianceTab) => void
}) {
  const t = useTranslations('Compliance.nav')

  return (
    <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
      {tabs.map(tab => {
        const isActive = active === tab.key
        const className = `inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${
          isActive
            ? 'bg-background text-foreground shadow'
            : 'hover:text-foreground'
        }`

        // Filing Links is always a route
        if (tab.key === 'links') {
          return (
            <Link key={tab.key} href="/compliance/links" className={className}>
              {t(tab.key)}
            </Link>
          )
        }

        // If we have an onSelect handler (on the compliance page), use buttons
        if (onSelect) {
          return (
            <button
              key={tab.key}
              onClick={() => onSelect(tab.key)}
              className={className}
            >
              {t(tab.key)}
            </button>
          )
        }

        // Otherwise (on sub-pages like links), link back to compliance with view param
        return (
          <Link
            key={tab.key}
            href={`/compliance?view=${tab.key}`}
            className={className}
          >
            {t(tab.key)}
          </Link>
        )
      })}
    </div>
  )
}
