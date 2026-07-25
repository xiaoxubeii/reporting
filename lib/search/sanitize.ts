const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g

export function boundedPlainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const text = value
    .slice(0, Math.max(maxLength * 8, maxLength))
    .replace(/<(script|style|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.slice(0, maxLength).trim() : null
}

export function normalizedIsoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}
