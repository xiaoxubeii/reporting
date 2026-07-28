const UNAVAILABLE_PATTERNS = [
  /API key not configured for fund/i,
  /ENCRYPTION_KEY environment variable is not set/i,
]

export function isExpertGenerationUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return UNAVAILABLE_PATTERNS.some(pattern => pattern.test(error.message))
}
