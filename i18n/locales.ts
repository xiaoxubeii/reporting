export const SUPPORTED_LOCALES = Object.freeze(['en', 'zh-CN'] as const)

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE'

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.some(locale => locale === value)
}

function localeFromLanguageTag(rawTag: string): Locale | null {
  const tag = rawTag.trim().toLowerCase()
  if (tag === 'en' || tag.startsWith('en-')) return 'en'

  if (
    tag === 'zh' ||
    tag === 'zh-cn' ||
    tag.startsWith('zh-cn-') ||
    tag === 'zh-sg' ||
    tag.startsWith('zh-sg-') ||
    tag === 'zh-hans' ||
    tag.startsWith('zh-hans-')
  ) {
    return 'zh-CN'
  }

  return null
}

function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null

  const preferences = header
    .split(',')
    .map((part, index) => {
      const [rawTag, ...parameters] = part.trim().split(';')
      const qualityParameter = parameters.find(parameter => parameter.trim().toLowerCase().startsWith('q='))
      const parsedQuality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1
      const quality = Number.isFinite(parsedQuality) ? Math.min(Math.max(parsedQuality, 0), 1) : 0
      return { rawTag, quality, index }
    })
    .filter(preference => preference.rawTag && preference.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)

  for (const preference of preferences) {
    const locale = localeFromLanguageTag(preference.rawTag)
    if (locale) return locale
  }

  return null
}

export function resolveLocale({
  cookieLocale,
  acceptLanguage,
}: {
  cookieLocale: unknown
  acceptLanguage: string | null | undefined
}): Locale {
  if (isSupportedLocale(cookieLocale)) return cookieLocale
  return localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE
}
