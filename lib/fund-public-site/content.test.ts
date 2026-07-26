import { describe, expect, it } from 'vitest'
import {
  createDefaultFundPublicSiteContent,
  parseFundPublicSiteContent,
  resolveLocalizedText,
} from './content'

describe('Fund public site content contract', () => {
  it('accepts one strict bilingual V1 document', () => {
    const content = createDefaultFundPublicSiteContent('Alpha Ventures')
    expect(parseFundPublicSiteContent(content)).toEqual(content)
  })

  it('always creates a valid default from an unrestricted Fund name', () => {
    const longDefault = createDefaultFundPublicSiteContent('x'.repeat(500))
    expect(longDefault.hero.title.en).toHaveLength(160)
    expect(parseFundPublicSiteContent(longDefault)).toEqual(longDefault)

    const markupDefault = createDefaultFundPublicSiteContent('<script>Fund</script>')
    expect(markupDefault.hero.title.en).toBe('Fund')
    expect(parseFundPublicSiteContent(markupDefault)).toEqual(markupDefault)
  })

  it('rejects unsupported versions, unknown fields, markup, and unsafe links', () => {
    const content = createDefaultFundPublicSiteContent('Alpha Ventures')
    const invalid = [
      { ...content, schemaVersion: 2 },
      { ...content, fundId: 'secret' },
      { ...content, hero: { ...content.hero, title: { en: '<script>alert(1)</script>' } } },
      { ...content, contact: { ...content.contact, websiteUrl: 'javascript:alert(1)' } },
      { ...content, contact: { ...content.contact, websiteUrl: '//tracker.example' } },
      { ...content, contact: { ...content.contact, websiteUrl: 'https://user:pass@example.com' } },
      { ...content, team: [{ id: 'person-1', name: 'Person', imageUrl: 'https://127.0.0.1/photo.jpg' }] },
      { ...content, portfolio: [{ id: 'company-1', name: 'Company', logoUrl: 'https://tracker.example/logo.png' }] },
    ]

    for (const value of invalid) expect(() => parseFundPublicSiteContent(value)).toThrow()
  })

  it('bounds arrays and fields', () => {
    const content = createDefaultFundPublicSiteContent('Alpha Ventures')
    expect(() => parseFundPublicSiteContent({
      ...content,
      hero: { ...content.hero, summary: { en: 'x'.repeat(1201) } },
    })).toThrow()
    expect(() => parseFundPublicSiteContent({
      ...content,
      team: Array.from({ length: 25 }, (_, index) => ({ id: `person-${index}`, name: `Person ${index}` })),
    })).toThrow()
    expect(() => parseFundPublicSiteContent({
      ...content,
      portfolio: [
        { id: 'duplicate', name: 'One' },
        { id: 'duplicate', name: 'Two' },
      ],
    })).toThrow(/unique/)
  })

  it('accepts image assets only from an explicitly approved HTTPS origin', () => {
    const previous = process.env.FUND_PUBLIC_SITE_ASSET_ORIGINS
    process.env.FUND_PUBLIC_SITE_ASSET_ORIGINS = 'https://assets.example.com'
    try {
      const content = createDefaultFundPublicSiteContent('Alpha Ventures')
      const withAsset = {
        ...content,
        team: [{ id: 'person-1', name: 'Person', imageUrl: 'https://assets.example.com/team/person.jpg' }],
      }
      expect(parseFundPublicSiteContent(withAsset).team[0].imageUrl)
        .toBe('https://assets.example.com/team/person.jpg')
    } finally {
      if (previous === undefined) delete process.env.FUND_PUBLIC_SITE_ASSET_ORIGINS
      else process.env.FUND_PUBLIC_SITE_ASSET_ORIGINS = previous
    }
  })

  it('falls back requested locale, default locale, then the other locale', () => {
    expect(resolveLocalizedText({ en: 'English', 'zh-CN': '中文' }, 'zh-CN', 'en')).toBe('中文')
    expect(resolveLocalizedText({ en: 'English' }, 'zh-CN', 'en')).toBe('English')
    expect(resolveLocalizedText({ 'zh-CN': '中文' }, 'en', 'en')).toBe('中文')
    expect(resolveLocalizedText({}, 'en', 'zh-CN')).toBeNull()
  })

  it('allows exactly three presentation keys', async () => {
    const { isFundPublicSiteTemplate } = await import('./templates')
    expect(['focus', 'institutional', 'minimal'].every(isFundPublicSiteTemplate)).toBe(true)
    expect(isFundPublicSiteTemplate('custom')).toBe(false)
  })
})
