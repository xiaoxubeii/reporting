import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
import { FundPublicSite } from '@/components/fund-public-site/fund-public-site'
import { createDefaultFundPublicSiteContent } from '@/lib/fund-public-site/content'
import type { FundPublicSiteTemplate } from '@/lib/fund-public-site/templates'

describe('built-in Fund public site templates', () => {
  it.each<FundPublicSiteTemplate>(['focus', 'institutional', 'minimal'])('renders %s from the shared content contract', templateKey => {
    const content = createDefaultFundPublicSiteContent('Alpha Ventures')
    content.strategy.sectors = ['Healthcare']
    const html = renderToStaticMarkup(
      <FundPublicSite fundName="Alpha Ventures" logoUrl={null} templateKey={templateKey} content={content} locale="en" />,
    )
    expect(html).toContain(`data-template="${templateKey}"`)
    expect(html).toContain('<h1')
    expect(html).toContain('Alpha Ventures')
    expect(html).not.toContain('Taylor Davidson')
    expect(html).not.toContain('GitHub')
  })

  it('omits empty optional team and portfolio sections', () => {
    const content = createDefaultFundPublicSiteContent('Alpha Ventures')
    const html = renderToStaticMarkup(
      <FundPublicSite fundName="Alpha Ventures" logoUrl={null} templateKey="institutional" content={content} locale="en" />,
    )
    expect(html).not.toContain('>Team<')
    expect(html).not.toContain('>Portfolio<')
  })

  it('switching templates does not mutate content', () => {
    const content = createDefaultFundPublicSiteContent('Alpha Ventures')
    const before = structuredClone(content)
    for (const templateKey of ['focus', 'institutional', 'minimal'] as const) {
      renderToStaticMarkup(
        <FundPublicSite fundName="Alpha Ventures" logoUrl={null} templateKey={templateKey} content={content} locale="en" />,
      )
    }
    expect(content).toEqual(before)
  })

  it('renders stored markup as escaped text and protects external links', () => {
    const content = createDefaultFundPublicSiteContent('Alpha Ventures')
    content.hero.summary.en = '<script>alert(1)</script>'
    content.contact = {
      ctaKind: 'website',
      ctaLabel: { en: 'Visit' },
      websiteUrl: 'https://example.com/',
    }
    const html = renderToStaticMarkup(
      <FundPublicSite fundName="Alpha Ventures" logoUrl={null} templateKey="focus" content={content} locale="en" />,
    )
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
