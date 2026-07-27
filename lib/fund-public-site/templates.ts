export const FUND_PUBLIC_SITE_TEMPLATES = ['focus', 'institutional', 'minimal'] as const

export type FundPublicSiteTemplate = typeof FUND_PUBLIC_SITE_TEMPLATES[number]

export function isFundPublicSiteTemplate(value: unknown): value is FundPublicSiteTemplate {
  return typeof value === 'string' && FUND_PUBLIC_SITE_TEMPLATES.includes(value as FundPublicSiteTemplate)
}
