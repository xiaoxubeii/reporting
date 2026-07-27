export const FUND_PUBLIC_SITE_CONTENT_VERSION = 1 as const
export const FUND_PUBLIC_SITE_MAX_BYTES = 50_000
export const FUND_PUBLIC_SITE_LOCALES = ['en', 'zh-CN'] as const

export type FundPublicSiteLocale = typeof FUND_PUBLIC_SITE_LOCALES[number]
export type LocalizedText = Partial<Record<FundPublicSiteLocale, string>>

export interface FundPublicSitePerson {
  id: string
  name: string
  role?: LocalizedText
  bio?: LocalizedText
  imageUrl?: string
  websiteUrl?: string
}

export interface FundPublicSitePortfolioEntry {
  id: string
  name: string
  description?: LocalizedText
  logoUrl?: string
  websiteUrl?: string
}

export interface FundPublicSiteContentV1 {
  schemaVersion: 1
  defaultLocale: FundPublicSiteLocale
  hero: {
    eyebrow: LocalizedText
    title: LocalizedText
    summary: LocalizedText
  }
  about: {
    heading: LocalizedText
    body: LocalizedText
  }
  strategy: {
    heading: LocalizedText
    sectors: string[]
    stages: string[]
    geographies: string[]
    checkSize: LocalizedText
  }
  team: FundPublicSitePerson[]
  portfolio: FundPublicSitePortfolioEntry[]
  contact: {
    email?: string
    websiteUrl?: string
    ctaKind: 'email' | 'website' | 'auth' | 'portal'
    ctaLabel: LocalizedText
  }
  seo: {
    title: LocalizedText
    description: LocalizedText
  }
  visibility: {
    about: boolean
    strategy: boolean
    team: boolean
    portfolio: boolean
    contact: boolean
    lpLogin: boolean
  }
}

export class FundPublicSiteValidationError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(issues[0] ?? 'Invalid Fund public site content')
    this.name = 'FundPublicSiteValidationError'
    this.issues = issues
  }
}

export function createDefaultFundPublicSiteContent(fundName: string): FundPublicSiteContentV1 {
  const cleanedName = cleanText(fundName)
  const name = cleanedName && !containsMarkup(cleanedName)
    ? cleanedName.slice(0, 160).trim() || 'Fund'
    : 'Fund'
  return {
    schemaVersion: 1,
    defaultLocale: 'en',
    hero: {
      eyebrow: { en: 'Investment partnership', 'zh-CN': '投资伙伴' },
      title: { en: name, 'zh-CN': name },
      summary: { en: 'Backing exceptional founders for the long term.', 'zh-CN': '长期支持卓越的创业者。' },
    },
    about: {
      heading: { en: 'About', 'zh-CN': '关于我们' },
      body: { en: '', 'zh-CN': '' },
    },
    strategy: {
      heading: { en: 'Investment focus', 'zh-CN': '投资方向' },
      sectors: [],
      stages: [],
      geographies: [],
      checkSize: { en: '', 'zh-CN': '' },
    },
    team: [],
    portfolio: [],
    contact: {
      ctaKind: 'auth',
      ctaLabel: { en: 'Sign in', 'zh-CN': '登录' },
    },
    seo: {
      title: { en: name, 'zh-CN': name },
      description: { en: '', 'zh-CN': '' },
    },
    visibility: {
      about: true,
      strategy: true,
      team: true,
      portfolio: true,
      contact: true,
      lpLogin: true,
    },
  }
}

export function parseFundPublicSiteContent(input: unknown): FundPublicSiteContentV1 {
  const issues: string[] = []
  if (!isRecord(input)) throw new FundPublicSiteValidationError(['Content must be an object'])
  if (serializedBytes(input) > FUND_PUBLIC_SITE_MAX_BYTES) issues.push('Content is too large')
  exactKeys(input, ['schemaVersion', 'defaultLocale', 'hero', 'about', 'strategy', 'team', 'portfolio', 'contact', 'seo', 'visibility'], 'content', issues)
  if (input.schemaVersion !== 1) issues.push('schemaVersion must be 1')
  if (!isLocale(input.defaultLocale)) issues.push('defaultLocale is invalid')

  const hero = parseLocalizedGroup(input.hero, ['eyebrow', 'title', 'summary'], 'hero', issues, { title: 160, eyebrow: 100, summary: 1200 })
  const about = parseLocalizedGroup(input.about, ['heading', 'body'], 'about', issues, { heading: 120, body: 5000 })
  const seo = parseLocalizedGroup(input.seo, ['title', 'description'], 'seo', issues, { title: 160, description: 320 })
  const strategy = parseStrategy(input.strategy, issues)
  const contact = parseContact(input.contact, issues)
  const visibility = parseVisibility(input.visibility, issues)
  const team = parseTeam(input.team, issues)
  const portfolio = parsePortfolio(input.portfolio, issues)

  if (issues.length) throw new FundPublicSiteValidationError(issues)
  return {
    schemaVersion: 1,
    defaultLocale: input.defaultLocale as FundPublicSiteLocale,
    hero: hero as FundPublicSiteContentV1['hero'],
    about: about as FundPublicSiteContentV1['about'],
    strategy: strategy as FundPublicSiteContentV1['strategy'],
    team,
    portfolio,
    contact: contact as FundPublicSiteContentV1['contact'],
    seo: seo as FundPublicSiteContentV1['seo'],
    visibility: visibility as FundPublicSiteContentV1['visibility'],
  }
}

export function resolveLocalizedText(
  value: LocalizedText | undefined,
  requested: FundPublicSiteLocale,
  defaultLocale: FundPublicSiteLocale,
): string | null {
  if (!value) return null
  const other: FundPublicSiteLocale = defaultLocale === 'en' ? 'zh-CN' : 'en'
  for (const locale of [requested, defaultLocale, other] as const) {
    const candidate = cleanText(value[locale])
    if (candidate) return candidate
  }
  return null
}

export function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname)
  } catch {
    return false
  }
}

function parseLocalizedGroup(
  value: unknown,
  keys: readonly string[],
  path: string,
  issues: string[],
  lengths: Readonly<Record<string, number>>,
): Record<string, LocalizedText> {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`)
    return {}
  }
  exactKeys(value, keys, path, issues)
  return Object.fromEntries(keys.map(key => [key, parseLocalizedText(value[key], `${path}.${key}`, lengths[key], issues)]))
}

function parseLocalizedText(value: unknown, path: string, max: number, issues: string[]): LocalizedText {
  if (!isRecord(value)) {
    issues.push(`${path} must be a localized object`)
    return {}
  }
  exactKeys(value, FUND_PUBLIC_SITE_LOCALES, path, issues)
  const result: LocalizedText = {}
  for (const locale of FUND_PUBLIC_SITE_LOCALES) {
    const text = value[locale]
    if (text === undefined) continue
    if (typeof text !== 'string' || text.length > max || containsMarkup(text)) issues.push(`${path}.${locale} is invalid`)
    else result[locale] = text.trim()
  }
  return result
}

function parseStrategy(value: unknown, issues: string[]): FundPublicSiteContentV1['strategy'] | Record<string, never> {
  if (!isRecord(value)) {
    issues.push('strategy must be an object')
    return {}
  }
  exactKeys(value, ['heading', 'sectors', 'stages', 'geographies', 'checkSize'], 'strategy', issues)
  return {
    heading: parseLocalizedText(value.heading, 'strategy.heading', 120, issues),
    sectors: parseTextArray(value.sectors, 'strategy.sectors', 20, 100, issues),
    stages: parseTextArray(value.stages, 'strategy.stages', 12, 100, issues),
    geographies: parseTextArray(value.geographies, 'strategy.geographies', 20, 100, issues),
    checkSize: parseLocalizedText(value.checkSize, 'strategy.checkSize', 160, issues),
  }
}

function parseContact(value: unknown, issues: string[]): FundPublicSiteContentV1['contact'] | Record<string, never> {
  if (!isRecord(value)) {
    issues.push('contact must be an object')
    return {}
  }
  exactKeys(value, ['email', 'websiteUrl', 'ctaKind', 'ctaLabel'], 'contact', issues)
  const email = optionalEmail(value.email, 'contact.email', issues)
  const websiteUrl = optionalHttps(value.websiteUrl, 'contact.websiteUrl', issues)
  if (!['email', 'website', 'auth', 'portal'].includes(String(value.ctaKind))) issues.push('contact.ctaKind is invalid')
  if (value.ctaKind === 'email' && !email) issues.push('contact.email is required for email CTA')
  if (value.ctaKind === 'website' && !websiteUrl) issues.push('contact.websiteUrl is required for website CTA')
  return {
    ...(email ? { email } : {}),
    ...(websiteUrl ? { websiteUrl } : {}),
    ctaKind: value.ctaKind as FundPublicSiteContentV1['contact']['ctaKind'],
    ctaLabel: parseLocalizedText(value.ctaLabel, 'contact.ctaLabel', 100, issues),
  }
}

function parseVisibility(value: unknown, issues: string[]): FundPublicSiteContentV1['visibility'] | Record<string, never> {
  const keys = ['about', 'strategy', 'team', 'portfolio', 'contact', 'lpLogin'] as const
  if (!isRecord(value)) {
    issues.push('visibility must be an object')
    return {}
  }
  exactKeys(value, keys, 'visibility', issues)
  const result: Record<string, boolean> = {}
  for (const key of keys) {
    if (typeof value[key] !== 'boolean') issues.push(`visibility.${key} must be boolean`)
    result[key] = value[key] === true
  }
  return result as FundPublicSiteContentV1['visibility']
}

function parseTeam(value: unknown, issues: string[]): FundPublicSitePerson[] {
  if (!Array.isArray(value) || value.length > 24) {
    issues.push('team must contain at most 24 entries')
    return []
  }
  const entries = value.map((item, index) => {
    const path = `team.${index}`
    if (!isRecord(item)) {
      issues.push(`${path} must be an object`)
      return { id: `invalid-${index}`, name: '' }
    }
    exactKeys(item, ['id', 'name', 'role', 'bio', 'imageUrl', 'websiteUrl'], path, issues)
    const id = requiredPlain(item.id, `${path}.id`, 80, issues)
    const name = requiredPlain(item.name, `${path}.name`, 160, issues)
    return {
      id,
      name,
      ...(item.role !== undefined ? { role: parseLocalizedText(item.role, `${path}.role`, 160, issues) } : {}),
      ...(item.bio !== undefined ? { bio: parseLocalizedText(item.bio, `${path}.bio`, 1200, issues) } : {}),
      ...(item.imageUrl !== undefined ? optionalField('imageUrl', optionalAssetUrl(item.imageUrl, `${path}.imageUrl`, issues)) : {}),
      ...(item.websiteUrl !== undefined ? optionalField('websiteUrl', optionalHttps(item.websiteUrl, `${path}.websiteUrl`, issues)) : {}),
    }
  })
  reportDuplicateIds(entries, 'team', issues)
  return entries
}

function parsePortfolio(value: unknown, issues: string[]): FundPublicSitePortfolioEntry[] {
  if (!Array.isArray(value) || value.length > 40) {
    issues.push('portfolio must contain at most 40 entries')
    return []
  }
  const entries = value.map((item, index) => {
    const path = `portfolio.${index}`
    if (!isRecord(item)) {
      issues.push(`${path} must be an object`)
      return { id: `invalid-${index}`, name: '' }
    }
    exactKeys(item, ['id', 'name', 'description', 'logoUrl', 'websiteUrl'], path, issues)
    return {
      id: requiredPlain(item.id, `${path}.id`, 80, issues),
      name: requiredPlain(item.name, `${path}.name`, 160, issues),
      ...(item.description !== undefined ? { description: parseLocalizedText(item.description, `${path}.description`, 500, issues) } : {}),
      ...(item.logoUrl !== undefined ? optionalField('logoUrl', optionalAssetUrl(item.logoUrl, `${path}.logoUrl`, issues)) : {}),
      ...(item.websiteUrl !== undefined ? optionalField('websiteUrl', optionalHttps(item.websiteUrl, `${path}.websiteUrl`, issues)) : {}),
    }
  })
  reportDuplicateIds(entries, 'portfolio', issues)
  return entries
}

function reportDuplicateIds(entries: ReadonlyArray<{ id: string }>, path: string, issues: string[]): void {
  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.id)) issues.push(`${path} ids must be unique`)
    seen.add(entry.id)
  }
}

function parseTextArray(value: unknown, path: string, maxItems: number, maxLength: number, issues: string[]): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    issues.push(`${path} has too many entries`)
    return []
  }
  return value.map((item, index) => requiredPlain(item, `${path}.${index}`, maxLength, issues))
}

function requiredPlain(value: unknown, path: string, max: number, issues: string[]): string {
  if (typeof value !== 'string' || !cleanText(value) || value.length > max || containsMarkup(value)) {
    issues.push(`${path} is invalid`)
    return ''
  }
  return value.trim()
}

function optionalEmail(value: unknown, path: string, issues: string[]): string | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    issues.push(`${path} is invalid`)
    return undefined
  }
  return value.toLowerCase()
}

function optionalHttps(value: unknown, path: string, issues: string[]): string | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || value.length > 2048 || !isSafeHttpsUrl(value)) {
    issues.push(`${path} must be a safe HTTPS URL`)
    return undefined
  }
  return new URL(value).toString()
}

function optionalAssetUrl(value: unknown, path: string, issues: string[]): string | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || value.length > 2048 || !isSafeHttpsUrl(value)) {
    issues.push(`${path} must use an approved asset origin`)
    return undefined
  }
  const url = new URL(value)
  if (!fundPublicSiteAssetOrigins().has(url.origin)) {
    issues.push(`${path} must use an approved asset origin`)
    return undefined
  }
  return url.toString()
}

function fundPublicSiteAssetOrigins(): ReadonlySet<string> {
  const candidates = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    ...(process.env.FUND_PUBLIC_SITE_ASSET_ORIGINS?.split(',') ?? []),
  ]
  const origins = new Set<string>()
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue
    try {
      const url = new URL(candidate.trim())
      if (url.protocol === 'https:' && !url.username && !url.password) origins.add(url.origin)
    } catch {
      // Invalid configuration never broadens the public asset allowlist.
    }
  }
  return origins
}

function optionalField<Key extends string>(key: Key, value: string | undefined): Partial<Record<Key, string>> {
  return value ? { [key]: value } as Record<Key, string> : {}
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string, issues: string[]): void {
  const allowed = new Set(keys)
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(`${path}.${key} is not allowed`)
}

function containsMarkup(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value)
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isLocale(value: unknown): value is FundPublicSiteLocale {
  return value === 'en' || value === 'zh-CN'
}

function serializedBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return Number.POSITIVE_INFINITY
  }
}
