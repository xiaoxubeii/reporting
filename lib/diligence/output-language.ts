import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from '@/i18n/locales'

export type DiligenceOutputLanguage = Locale

export const DEFAULT_DILIGENCE_OUTPUT_LANGUAGE: DiligenceOutputLanguage = DEFAULT_LOCALE

export function parseDiligenceOutputLanguage(value: unknown): DiligenceOutputLanguage | null {
  return isSupportedLocale(value) ? value : null
}

export function resolveDiligenceOutputLanguage(value: unknown): DiligenceOutputLanguage {
  return parseDiligenceOutputLanguage(value) ?? DEFAULT_DILIGENCE_OUTPUT_LANGUAGE
}

export function resolveDraftOutputLanguage(
  draft: { output_language?: unknown } | null | undefined,
): DiligenceOutputLanguage {
  return resolveDiligenceOutputLanguage(draft?.output_language)
}

export function buildOutputLanguageInstruction(language: DiligenceOutputLanguage): string {
  const label = language === 'zh-CN' ? 'Simplified Chinese (zh-CN)' : 'English (en)'
  return `=== OUTPUT LANGUAGE (NON-NEGOTIABLE) ===
Write every generated natural-language value, explanation, summary, question, rationale, heading, and prose passage in ${label}.
Keep JSON keys, schema field names, enum tokens, identifiers, dimension IDs, source IDs, citation IDs, URLs, numbers, and machine-readable contract values exactly as defined by their schemas.
Preserve proper nouns in their established source form. Preserve direct quotations and other verbatim evidence in the original language; write the surrounding synthesis in ${label}.
Never translate missing-data markers into assertions, and never invent evidence to make the requested language read more fluently.`
}

export interface GeneratedArtifactSnapshot {
  ingestion_output?: unknown
  research_output?: unknown
  checklist_assessment_output?: unknown
  qa_answers?: unknown
  memo_draft_output?: unknown
  is_draft?: boolean
}

function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

export function hasGeneratedArtifacts(draft: GeneratedArtifactSnapshot | null | undefined): boolean {
  if (!draft) return false
  return [
    draft.ingestion_output,
    draft.research_output,
    draft.checklist_assessment_output,
    draft.qa_answers,
    draft.memo_draft_output,
  ].some(hasContent)
}

export type OutputLanguageChangeDecision = 'noop' | 'update_in_place' | 'create_version'

export function decideOutputLanguageChange(params: {
  currentLanguage: DiligenceOutputLanguage
  requestedLanguage: DiligenceOutputLanguage
  draft?: GeneratedArtifactSnapshot | null
}): OutputLanguageChangeDecision {
  if (params.currentLanguage === params.requestedLanguage) return 'noop'
  if (params.draft?.is_draft === false || hasGeneratedArtifacts(params.draft)) return 'create_version'
  return 'update_in_place'
}
