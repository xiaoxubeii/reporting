import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  resolveLocale,
} from '../i18n/locales'
import { MESSAGE_LOADERS, loadMessages } from '../i18n/messages'
import { localeHashRestoreUrl } from '../i18n/navigation'
import { translationFallback } from '../i18n/runtime'

function flattenedKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [prefix]
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenedKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function flattenedMessages(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []

  return Object.entries(value).flatMap(([key, child]) =>
    flattenedMessages(child, prefix ? `${prefix}.${key}` : key),
  )
}

function dottedObjectKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []

  return Object.entries(value).flatMap(([key, child]) => [
    ...(key.includes('.') ? [prefix ? `${prefix}.${key}` : key] : []),
    ...dottedObjectKeys(child, prefix ? `${prefix}.${key}` : key),
  ])
}

function messageSignature(elements: MessageFormatElement[]): string[] {
  const signature = new Set<string>()

  function visit(items: MessageFormatElement[]) {
    for (const element of items) {
      if (
        element.type === TYPE.argument ||
        element.type === TYPE.number ||
        element.type === TYPE.date ||
        element.type === TYPE.time ||
        element.type === TYPE.select ||
        element.type === TYPE.plural
      ) {
        signature.add(`argument:${element.value}`)
      }
      if (element.type === TYPE.tag) {
        signature.add(`tag:${element.value}`)
        visit(element.children)
      }
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        Object.values(element.options).forEach(option => visit(option.value))
      }
    }
  }

  visit(elements)
  return Array.from(signature).sort()
}

describe('UI locale contract', () => {
  it('renders a stable key fallback when a runtime message is missing', () => {
    expect(translationFallback({ namespace: 'Dashboard', key: 'missing.title' })).toBe('Dashboard.missing.title')
    expect(translationFallback({ key: 'missing.title' })).toBe('missing.title')
  })
  it('exposes an immutable English and Simplified Chinese allowlist', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'zh-CN'])
    expect(Object.isFrozen(SUPPORTED_LOCALES)).toBe(true)
    expect(DEFAULT_LOCALE).toBe('en')
    expect(LOCALE_COOKIE_NAME).toBe('NEXT_LOCALE')

    expect(isSupportedLocale('en')).toBe(true)
    expect(isSupportedLocale('zh-CN')).toBe(true)
    expect(isSupportedLocale('zh')).toBe(false)
    expect(isSupportedLocale('ZH-cn')).toBe(false)
    expect(isSupportedLocale('')).toBe(false)
    expect(isSupportedLocale('../zh-CN')).toBe(false)
    expect(isSupportedLocale(null)).toBe(false)
    expect(isSupportedLocale(undefined)).toBe(false)
  })

  it('prefers a valid cookie, then a compatible browser language, then English', () => {
    expect(resolveLocale({ cookieLocale: 'zh-CN', acceptLanguage: 'en-US,en;q=0.9' })).toBe('zh-CN')
    expect(resolveLocale({ cookieLocale: 'invalid', acceptLanguage: 'zh-Hans-CN,zh;q=0.9,en;q=0.8' })).toBe('zh-CN')
    expect(resolveLocale({ cookieLocale: null, acceptLanguage: 'en-GB,zh-CN;q=0.8' })).toBe('en')
    expect(resolveLocale({ cookieLocale: null, acceptLanguage: 'zh-TW,en;q=0.7' })).toBe('en')
    expect(resolveLocale({ cookieLocale: null, acceptLanguage: 'zh-CN;q=0,en;q=1' })).toBe('en')
    expect(resolveLocale({ cookieLocale: null, acceptLanguage: 'en;q=0.5, ZH-hans;q=1' })).toBe('zh-CN')
    expect(resolveLocale({ cookieLocale: '../messages/zh-CN', acceptLanguage: 'fr-FR' })).toBe('en')
    expect(resolveLocale({ cookieLocale: null, acceptLanguage: null })).toBe('en')
  })

  it('uses an explicit loader for every and only supported locale', async () => {
    const messageLoaderSource = readFileSync(resolve(process.cwd(), 'i18n/messages.ts'), 'utf8')

    expect(Object.keys(MESSAGE_LOADERS).sort()).toEqual([...SUPPORTED_LOCALES].sort())
    expect('..' in MESSAGE_LOADERS).toBe(false)
    expect(messageLoaderSource).toContain("import englishMessages from '../messages/en.json'")
    expect(messageLoaderSource).toContain("import simplifiedChineseMessages from '../messages/zh-CN.json'")
    expect(messageLoaderSource).not.toContain("import('../messages/")

    await expect(loadMessages('en')).resolves.toMatchObject({ Language: { label: 'Language' } })
    await expect(loadMessages('zh-CN')).resolves.toMatchObject({ Language: { label: '语言' } })
    await expect(loadMessages('../messages/zh-CN' as never)).rejects.toThrow('Unsupported locale')
  })

  it('keeps English and Simplified Chinese catalog keys in exact parity', () => {
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
    const chinese = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/zh-CN.json'), 'utf8'))

    expect(flattenedKeys(chinese).sort()).toEqual(flattenedKeys(english).sort())
    expect(flattenedKeys(english)).not.toContain('')
  })

  it('parses every ICU message and keeps argument and rich-text tag names aligned', () => {
    const englishCatalog = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
    const chineseCatalog = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/zh-CN.json'), 'utf8'))
    const english = Object.fromEntries(flattenedMessages(englishCatalog))
    const chinese = Object.fromEntries(flattenedMessages(chineseCatalog))

    expect(dottedObjectKeys(englishCatalog)).toEqual([])
    expect(dottedObjectKeys(chineseCatalog)).toEqual([])

    for (const [key, englishMessage] of Object.entries(english)) {
      expect(messageSignature(parse(englishMessage)), `invalid English ICU at ${key}`).toEqual(
        messageSignature(parse(chinese[key])),
      )
    }
  })

  it('exposes a language selector on every standalone full-screen entry', () => {
    const standaloneLayouts = [
      'app/setup/layout.tsx',
      'app/onboarding/layout.tsx',
      'app/demo/layout.tsx',
      'app/pending/layout.tsx',
      'app/oauth/layout.tsx',
      'app/submit/layout.tsx',
    ]

    for (const layout of standaloneLayouts) {
      expect(readFileSync(resolve(process.cwd(), layout), 'utf8'), layout).toContain(
        '<StandaloneLocaleControl />',
      )
    }
    expect(readFileSync(resolve(process.cwd(), 'app/expert-response/route.ts'), 'utf8'))
      .toContain('data-locale="zh-CN"')
  })

  it('keeps metric period storage locale-neutral and formats its UI from structured fields', () => {
    const metricPeriodSources = [
      'app/(app)/companies/[id]/add-data-point-dialog.tsx',
      'app/(app)/companies/[id]/data-point-popover.tsx',
      'app/(app)/companies/[id]/metric-chart.tsx',
      'app/(app)/companies/[id]/page.tsx',
    ].map(file => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n')

    expect(metricPeriodSources).toContain("tDataPoint('fiscalYear'")
    expect(metricPeriodSources).toContain("t('dataPoint.fiscalYear'")
    expect(metricPeriodSources).toContain("timeZone: 'UTC'")
    expect(metricPeriodSources).not.toContain("toLocaleString('en'")
    expect(metricPeriodSources).not.toContain('`Year End ${yr}`')
    expect(metricPeriodSources).not.toContain('{dataPoint.period_label}</span>')
  })

  it('localizes the complete Import workflow through one semantic namespace', () => {
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
    const chinese = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/zh-CN.json'), 'utf8'))
    const importPage = readFileSync(resolve(process.cwd(), 'app/(app)/import/page.tsx'), 'utf8')
    const importLayout = readFileSync(resolve(process.cwd(), 'app/(app)/import/layout.tsx'), 'utf8')

    expect(flattenedKeys(chinese.Import)).toEqual(flattenedKeys(english.Import))
    expect(importPage).toContain("useTranslations('Import')")
    expect(importLayout).toContain("getTranslations('Import')")
    expect(importPage).toContain('type ImportUiError =')
    expect(importPage).toContain('renderUiError(docError)')
    expect(importPage).toContain('setDocSuccess({ successCount, errorCount })')
    expect(importPage).not.toMatch(/set(?:Doc|Investment|CashFlow)?Error\(t\(/)
    expect(importPage).not.toContain('setDocSuccess(t(')
    expect(importPage).not.toContain('? err.message')

    const usedImportKeys = Array.from(
      new Set(
        Array.from(`${importPage}\n${importLayout}`.matchAll(/\bt\('([^']+)'/g), match => match[1]),
      ),
    ).sort()
    expect(usedImportKeys).toEqual(flattenedKeys(english.Import).sort())
    expect(Object.values(english.Import).length).toBeGreaterThan(0)

    for (const hardCodedCopy of [
      '>Import<',
      '>Document Upload<',
      '>Paste Company Metrics<',
      '>Paste Investment Data<',
      '>Paste Fund Cash Flows<',
      "setError('Something went wrong')",
    ]) {
      expect(importPage).not.toContain(hardCodedCopy)
    }
  })

  it('localizes the Analyst surface exposed by authenticated content pages', () => {
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
    const analystPanel = readFileSync(resolve(process.cwd(), 'components/analyst-panel.tsx'), 'utf8')
    const analystProposals = readFileSync(resolve(process.cwd(), 'components/analyst-proposals.tsx'), 'utf8')
    const analystPendingActions = readFileSync(resolve(process.cwd(), 'components/analyst-pending-actions.tsx'), 'utf8')
    const analystFloatingHost = readFileSync(resolve(process.cwd(), 'components/analyst-floating-host.tsx'), 'utf8')
    const analystContextActions = readFileSync(resolve(process.cwd(), 'components/analyst-context-actions.tsx'), 'utf8')
    const analystSources = [
      analystPanel,
      analystProposals,
      analystPendingActions,
      analystFloatingHost,
      analystContextActions,
    ].join('\n')

    const usedAnalystKeys = Array.from(
      new Set(
        Array.from(analystSources.matchAll(/\bt\('([^']+)'/g), match => match[1]),
      ),
    ).sort()

    expect(usedAnalystKeys).toEqual(flattenedKeys(english.Analyst).sort())
    expect(analystPanel).not.toContain('>Conversation History<')
    expect(analystPanel).not.toContain('>No previous conversations.<')
    expect(analystPanel).not.toContain("'Save as Summary'")
    expect(analystPanel).not.toContain('placeholder={inputPlaceholder(scope)}')
    expect(analystPanel).not.toContain('Draft the entry that records')
    expect(analystPanel).toContain('locale,')
    expect(analystProposals).not.toContain('>Proposed entries<')
    expect(analystProposals).not.toContain("setError('Could not apply")
    expect(analystPendingActions).not.toContain('>Proposed changes — approve to apply<')
    expect(analystPendingActions).not.toContain("'Network error.'")
  })

  it('localizes the complete Dashboard surface through one semantic namespace', () => {
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
    const chinese = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/zh-CN.json'), 'utf8'))
    const dashboardFiles = [
      'app/(app)/dashboard/page.tsx',
      'app/(app)/dashboard/dashboard-companies.tsx',
      'app/(app)/dashboard/dashboard-table.tsx',
      'app/(app)/dashboard/dashboard-notes.tsx',
    ]
    const dashboardSources = dashboardFiles
      .map(file => readFileSync(resolve(process.cwd(), file), 'utf8'))
      .join('\n')

    expect(flattenedKeys(chinese.Dashboard)).toEqual(flattenedKeys(english.Dashboard))
    expect(dashboardSources).toContain("getTranslations('Dashboard')")
    expect(dashboardSources).toContain("useTranslations('Dashboard')")

    const usedDashboardKeys = Array.from(
      new Set(
        Array.from(dashboardSources.matchAll(/\bt\('([^']+)'/g), match => match[1]),
      ),
    ).sort()

    expect(usedDashboardKeys).toEqual(flattenedKeys(english.Dashboard).sort())
    for (const productCopy of [
      '>Portfolio<',
      '>Team Notes<',
      '>No data available.<',
      '>No companies match the selected filters.<',
      'placeholder="Write a note...',
      "toLocaleDateString('en-US'",
    ]) {
      expect(dashboardSources).not.toContain(productCopy)
    }
  })

  it('localizes the Portal layout and shared account security controls', () => {
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
    const chinese = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/zh-CN.json'), 'utf8'))
    const portalFiles = [
      'app/portal/layout.tsx',
      'app/portal/contact/page.tsx',
      'app/portal/overview/page.tsx',
      'app/portal/settings/page.tsx',
      'app/portal/welcome/page.tsx',
      'app/portal/snapshots/page.tsx',
      'app/portal/snapshots/[snapshotId]/page.tsx',
      'app/portal/letters/[letterId]/page.tsx',
      'components/portal/access-history.tsx',
      'components/portal/document-viewer.tsx',
      'components/portal/lp-analyst.tsx',
      'components/portal/overview-view.tsx',
    ]
    const portalSources = portalFiles
      .map(file => readFileSync(resolve(process.cwd(), file), 'utf8'))
      .join('\n')
    const mfaSettings = readFileSync(
      resolve(process.cwd(), 'components/account/mfa-settings.tsx'),
      'utf8',
    )

    expect(flattenedKeys(chinese.Portal).sort()).toEqual(flattenedKeys(english.Portal).sort())
    expect(flattenedKeys(chinese.AccountSecurity).sort()).toEqual(
      flattenedKeys(english.AccountSecurity).sort(),
    )
    expect(portalSources).toContain("getTranslations('Portal')")
    expect(portalSources).toContain("useTranslations('Portal')")
    expect(mfaSettings).toContain("useTranslations('AccountSecurity')")

    const usedPortalKeys = Array.from(
      new Set(Array.from(portalSources.matchAll(/\bt\('([^']+)'/g), match => match[1])),
    ).sort()
    const usedAccountSecurityKeys = Array.from(
      new Set(Array.from(mfaSettings.matchAll(/\bt\('([^']+)'/g), match => match[1])),
    ).sort()

    expect(usedPortalKeys).toEqual(flattenedKeys(english.Portal).sort())
    expect(usedAccountSecurityKeys).toEqual(flattenedKeys(english.AccountSecurity).sort())
    expect(portalSources).not.toContain("fund?.name ?? 'Investor Portal'")
    expect(mfaSettings).not.toContain('>Two-factor authentication is enabled.<')
    expect(mfaSettings).not.toContain('>Disable<')
    expect(mfaSettings).not.toContain('alt="TOTP QR code"')
  })

  it('localizes global not-found and expert-response entry surfaces', () => {
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
    const chinese = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/zh-CN.json'), 'utf8'))
    const notFound = readFileSync(resolve(process.cwd(), 'app/not-found.tsx'), 'utf8')
    const expertResponse = readFileSync(resolve(process.cwd(), 'app/expert-response/route.ts'), 'utf8')

    expect(flattenedKeys(chinese.NotFound)).toEqual(flattenedKeys(english.NotFound))
    expect(flattenedKeys(chinese.ExpertResponse)).toEqual(flattenedKeys(english.ExpertResponse))
    expect(notFound).toContain("getTranslations('NotFound')")
    expect(expertResponse).toContain("namespace: 'ExpertResponse'")
    expect(expertResponse).not.toContain('<html lang="en">')
    expect(notFound).not.toContain('This page doesn&apos;t exist.')
    expect(expertResponse).not.toContain('<h1>Expert validation</h1>')
  })

  it('localizes demo and pending system entry pages', () => {
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
    const chinese = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/zh-CN.json'), 'utf8'))
    const demoSources = [
      readFileSync(resolve(process.cwd(), 'app/demo/page.tsx'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'app/demo/layout.tsx'), 'utf8'),
    ].join('\n')
    const pending = readFileSync(resolve(process.cwd(), 'app/pending/page.tsx'), 'utf8')

    expect(flattenedKeys(chinese.Demo)).toEqual(flattenedKeys(english.Demo))
    expect(flattenedKeys(chinese.Pending)).toEqual(flattenedKeys(english.Pending))
    expect(demoSources).toContain("useTranslations('Demo')")
    expect(demoSources).toContain("getTranslations('Demo')")
    expect(pending).toContain("getTranslations('Pending')")
    expect(demoSources).not.toContain('>Loading demo…<')
    expect(pending).not.toContain('>Pending Approval<')
  })

  it('localizes general public marketing and legal pages with semantic namespaces', () => {
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/en.json'), 'utf8'))
    const chinese = JSON.parse(readFileSync(resolve(process.cwd(), 'messages/zh-CN.json'), 'utf8'))
    const publicPages = {
      PublicHome: ['app/(public)/page.tsx'],
      Contact: ['app/(public)/contact/page.tsx', 'app/(public)/contact/layout.tsx'],
      Pricing: ['app/(public)/pricing/page.tsx'],
      License: ['app/(public)/license/page.tsx'],
      Privacy: ['app/(public)/privacy/page.tsx'],
      Terms: ['app/(public)/terms/page.tsx'],
    } as const

    for (const [namespace, files] of Object.entries(publicPages)) {
      expect(flattenedKeys(chinese[namespace])).toEqual(flattenedKeys(english[namespace]))
      const source = files.map(file => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n')
      expect(source).toContain(`Translations('${namespace}`)
      expect(source).toContain('generateMetadata')
    }

    const combinedSource = Object.values(publicPages)
      .flat()
      .map(file => readFileSync(resolve(process.cwd(), file), 'utf8'))
      .join('\n')
    for (const hardCodedCopy of [
      '>Run your fund with Hemrock<',
      '>Send a message<',
      '>What does it cost to run?<',
      '>Full license text<',
      '>Privacy Policy<',
      '>Terms of Service<',
    ]) {
      expect(combinedSource).not.toContain(hardCodedCopy)
    }
  })

  it('localizes shared chrome and exposes the selected language to assistive technology', () => {
    const languageSwitcher = readFileSync(
      resolve(process.cwd(), 'components/language-switcher.tsx'),
      'utf8',
    )
    const appSidebar = readFileSync(resolve(process.cwd(), 'components/app-sidebar.tsx'), 'utf8')
    const appLayout = readFileSync(resolve(process.cwd(), 'app/(app)/layout.tsx'), 'utf8')
    const appHeader = readFileSync(resolve(process.cwd(), 'components/app-header.tsx'), 'utf8')
    const publicLayout = readFileSync(resolve(process.cwd(), 'app/(public)/layout.tsx'), 'utf8')

    expect(languageSwitcher).toContain("t('labelWithCurrent'")
    expect(languageSwitcher).toContain('window.location.pathname')
    expect(languageSwitcher).toContain('window.location.search')
    expect(languageSwitcher).toContain('window.location.hash')
    expect(languageSwitcher).toContain('localeHashRestoreUrl(pendingLocation, window.location)')
    expect(languageSwitcher).toContain('router.refresh()')
    expect(languageSwitcher).toContain("compact && 'w-11 justify-center px-0")
    expect(appSidebar).toContain('<LanguageSwitcher compact className="h-9 w-full" />')
    expect(publicLayout).toContain('<LanguageSwitcher compact className="h-9 w-full" />')
    expect(languageSwitcher).not.toContain('document.documentElement.lang = nextLocale')
    expect(languageSwitcher).not.toContain('window.location.reload()')
    expect(appLayout).toContain("t('demoViewing')")
    expect(appLayout).toContain("t('exitDemo')")
    expect(appHeader).toContain("closeLabel={t('closeMenu')}")
    expect(appHeader).toContain('menuButtonRef.current?.focus()')
    expect(publicLayout).toContain("closeLabel={t('closeMenu')}")
  })

  it('restores only a refresh-dropped hash without overriding navigation or redirects', () => {
    const pending = { pathAndSearch: '/deals/123?tab=overview', hash: '#notes' }

    expect(localeHashRestoreUrl(pending, {
      pathname: '/deals/123',
      search: '?tab=overview',
      hash: '',
    })).toBe('/deals/123?tab=overview#notes')
    expect(localeHashRestoreUrl(pending, {
      pathname: '/auth',
      search: '?next=%2Fdeals%2F123',
      hash: '',
    })).toBeNull()
    expect(localeHashRestoreUrl(pending, {
      pathname: '/deals/123',
      search: '?tab=activity',
      hash: '',
    })).toBeNull()
    expect(localeHashRestoreUrl(pending, {
      pathname: '/deals/123',
      search: '?tab=overview',
      hash: '#activity',
    })).toBeNull()
  })
})
