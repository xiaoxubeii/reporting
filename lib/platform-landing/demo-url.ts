let didWarnAboutDemoUrl = false

export function parseDemoUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null

  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

export function loadDemoUrl(
  raw: string | undefined,
  options: {
    readonly hosted?: boolean
    readonly warn?: (message: string) => void
  } = {},
): string | null {
  const demoUrl = parseDemoUrl(raw)
  if (!demoUrl && options.hosted && !didWarnAboutDemoUrl) {
    didWarnAboutDemoUrl = true
    const warn = options.warn ?? console.warn
    warn('FundWorkspace demo URL is not configured with a valid HTTPS URL.')
  }
  return demoUrl
}
