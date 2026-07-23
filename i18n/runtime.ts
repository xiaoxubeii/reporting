type TranslationError = Error & { code?: string }

export function reportTranslationError(error: TranslationError): void {
  // Keep production usable even if a catalog regression slips through. Tests
  // enforce catalog parity and source coverage, while runtime logs retain the
  // machine-readable error code without exposing message values.
  console.error(`[i18n] ${error.code ?? 'translation_error'}`)
}

export function translationFallback({ key, namespace }: { key: string; namespace?: string }): string {
  return namespace ? `${namespace}.${key}` : key
}
