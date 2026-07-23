export interface PeriodLabelParts {
  period_label: string
  period_year?: number | null
  period_quarter?: number | null
  period_month?: number | null
}

const ENGLISH_MONTHS = new Map([
  ['jan', 1], ['january', 1],
  ['feb', 2], ['february', 2],
  ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4],
  ['may', 5],
  ['jun', 6], ['june', 6],
  ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8],
  ['sep', 9], ['sept', 9], ['september', 9],
  ['oct', 10], ['october', 10],
  ['nov', 11], ['november', 11],
  ['dec', 12], ['december', 12],
])

function formatMonth(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function formatQuarter(year: number, quarter: number, locale: string): string {
  return locale.startsWith('zh') ? `${year}年第${quarter}季度` : `Q${quarter} ${year}`
}

/**
 * Formats persisted reporting-period labels without changing the stored source value.
 * Recognized label semantics take precedence; structured fields are the fallback.
 * This preserves annual labels such as "Year End 2025" even when month 12 is also stored.
 */
export function formatPeriodLabel(parts: PeriodLabelParts, locale: string): string {
  const label = parts.period_label.trim()

  const yearEndMatch = label.match(/^(?:year\s*end|year-end)\s+(\d{4})$/i)
  if (yearEndMatch) {
    const year = Number(yearEndMatch[1])
    return locale.startsWith('zh') ? `${year}年末` : `Year End ${year}`
  }

  const fiscalYearMatch = label.match(/^(?:fy\s*|fiscal\s+year\s+)(\d{4})$/i)
  if (fiscalYearMatch) {
    const year = Number(fiscalYearMatch[1])
    return locale.startsWith('zh') ? `${year}财年` : `FY ${year}`
  }

  const quarterMatch = label.match(/^q([1-4])\s+(\d{4})$/i)
  if (quarterMatch) {
    return formatQuarter(Number(quarterMatch[2]), Number(quarterMatch[1]), locale)
  }

  const canonicalMonthMatch = label.match(/^(\d{4})-(0?[1-9]|1[0-2])$/)
  if (canonicalMonthMatch) {
    return formatMonth(Number(canonicalMonthMatch[1]), Number(canonicalMonthMatch[2]), locale)
  }

  const legacyMonthMatch = label.match(/^([A-Za-z]+)\s+(\d{4})$/)
  const legacyMonth = legacyMonthMatch
    ? ENGLISH_MONTHS.get(legacyMonthMatch[1].toLowerCase())
    : undefined
  if (legacyMonthMatch && legacyMonth) {
    return formatMonth(Number(legacyMonthMatch[2]), legacyMonth, locale)
  }

  if (parts.period_year && parts.period_month) {
    return formatMonth(parts.period_year, parts.period_month, locale)
  }

  if (parts.period_year && parts.period_quarter) {
    return formatQuarter(parts.period_year, parts.period_quarter, locale)
  }

  return label
}
