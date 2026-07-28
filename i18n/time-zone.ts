export const DEFAULT_TIME_ZONE = 'UTC'
export const TIME_ZONE_COOKIE_NAME = 'REPORTING_TIME_ZONE'

const MAX_TIME_ZONE_LENGTH = 128
const MAX_COOKIE_VALUE_LENGTH = 256

export type TimeZoneMode = 'auto' | 'manual'

export type ResolvedTimeZone = Readonly<{
  timeZone: string
  source: TimeZoneMode | 'fallback'
}>

export type ParsedTimeZoneCookie = Readonly<{
  mode: TimeZoneMode
  timeZone: string
}>

export function canonicalizeTimeZone(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_TIME_ZONE_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null
  }

  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

export function serializeTimeZoneCookie(mode: TimeZoneMode, timeZone: string): string {
  const canonicalTimeZone = canonicalizeTimeZone(timeZone)
  if ((mode !== 'auto' && mode !== 'manual') || canonicalTimeZone === null) {
    throw new TypeError('Invalid timezone preference')
  }

  return encodeURIComponent(`${mode}:${canonicalTimeZone}`)
}

export function parseTimeZoneCookie(value: unknown): ParsedTimeZoneCookie | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_COOKIE_VALUE_LENGTH) {
    return null
  }

  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return null
  }

  const separatorIndex = decoded.indexOf(':')
  if (separatorIndex < 0 || decoded.indexOf(':', separatorIndex + 1) >= 0) {
    return null
  }

  const mode = decoded.slice(0, separatorIndex)
  const timeZone = canonicalizeTimeZone(decoded.slice(separatorIndex + 1))
  if ((mode !== 'auto' && mode !== 'manual') || timeZone === null) {
    return null
  }

  return Object.freeze({ mode, timeZone })
}

export function resolveTimeZone(cookieValue: string | undefined): ResolvedTimeZone {
  const preference = parseTimeZoneCookie(cookieValue)
  if (preference === null) {
    return Object.freeze({ timeZone: DEFAULT_TIME_ZONE, source: 'fallback' })
  }

  return Object.freeze({ timeZone: preference.timeZone, source: preference.mode })
}
