export function formatMoney(
  value: number,
  currency: string,
  locale: string,
  fractionDigits = 2,
): string {
  const normalized = Object.is(value, -0) ? 0 : value
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(normalized)
}

export function formatCompactMoney(value: number, currency: string, locale: string): string {
  const normalized = Object.is(value, -0) ? 0 : value
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(normalized)
}

export function formatNumber(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(locale, options).format(Object.is(value, -0) ? 0 : value)
}

export function formatPercent(value: number, locale: string, fractionDigits = 1): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Object.is(value, -0) ? 0 : value)
}

export function formatDate(
  value: string | Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const date = value instanceof Date
    ? value
    : new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(date)
}
