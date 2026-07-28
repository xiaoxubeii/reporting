export interface FounderDossier {
  founder_name: string
  role: string
  background_summary: string
  sources: Array<{ title: string; url: string | null }>
  evidence_source_ids?: string[]
  open_questions: string[]
  dismissed?: boolean
}

function normalizeFounderName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Normalize untrusted model output before it reaches merge or rendering code. */
export function parseFounderDossiers(value: unknown): {
  dossiers: FounderDossier[]
  discarded: number
} {
  if (!Array.isArray(value)) return { dossiers: [], discarded: 0 }

  const dossiers: FounderDossier[] = []
  let discarded = 0
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.founder_name !== 'string' || !candidate.founder_name.trim()) {
      discarded += 1
      continue
    }

    const sources = Array.isArray(candidate.sources)
      ? candidate.sources.flatMap(source => {
          if (!isRecord(source) || typeof source.title !== 'string' || !source.title.trim()) return []
          return [{ title: source.title.trim(), url: normalizeSourceUrl(source.url) }]
        })
      : []
    const openQuestions = Array.isArray(candidate.open_questions)
      ? candidate.open_questions
          .filter((question): question is string => typeof question === 'string')
          .map(question => question.trim())
          .filter(Boolean)
      : []
    const evidenceSourceIds = Array.isArray(candidate.evidence_source_ids)
      ? Array.from(new Set(candidate.evidence_source_ids
          .filter((id): id is string => typeof id === 'string')
          .map(id => id.trim())
          .filter(Boolean)))
      : []

    dossiers.push({
      founder_name: candidate.founder_name.trim(),
      role: typeof candidate.role === 'string' ? candidate.role.trim() : '',
      background_summary: typeof candidate.background_summary === 'string' ? candidate.background_summary.trim() : '',
      sources,
      ...(evidenceSourceIds.length > 0 ? { evidence_source_ids: evidenceSourceIds } : {}),
      open_questions: openQuestions,
    })
  }

  return { dossiers, discarded }
}

function sourceKey(source: FounderDossier['sources'][number]): string {
  const url = source.url?.trim()
  return url
    ? `url:${url.toLocaleLowerCase('en-US')}`
    : `title:${source.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')}`
}

function cloneDossier(dossier: FounderDossier): FounderDossier {
  return {
    ...dossier,
    sources: dossier.sources.map(source => ({ ...source })),
    evidence_source_ids: dossier.evidence_source_ids ? [...dossier.evidence_source_ids] : undefined,
    open_questions: [...dossier.open_questions],
  }
}

function mergeSources(
  existing: FounderDossier['sources'],
  generated: FounderDossier['sources'],
): FounderDossier['sources'] {
  const seen = new Set(existing.map(sourceKey))
  const additions = generated.filter(source => {
    const key = sourceKey(source)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [...existing.map(source => ({ ...source })), ...additions.map(source => ({ ...source }))]
}

/**
 * Preserve partner-managed founder dossiers across Research reruns.
 *
 * Existing entries remain authoritative because the current schema has no
 * field-level AI/user provenance. Generated entries can contribute new sources
 * to a matching person and can append newly discovered people, but they never
 * overwrite an existing summary, role, questions, dismissal, or ordering.
 */
export function mergeFounderDossiers(
  existing: readonly FounderDossier[] | null | undefined,
  generated: readonly FounderDossier[] | null | undefined,
): FounderDossier[] {
  const preserved = (existing ?? []).map(cloneDossier)
  const indexByName = new Map<string, number>()

  preserved.forEach((dossier, index) => {
    const key = normalizeFounderName(dossier.founder_name)
    if (key && !indexByName.has(key)) indexByName.set(key, index)
  })

  for (const dossier of generated ?? []) {
    const key = normalizeFounderName(dossier.founder_name)
    const existingIndex = key ? indexByName.get(key) : undefined
    if (existingIndex !== undefined) {
      const current = preserved[existingIndex]
      preserved[existingIndex] = {
        ...current,
        sources: mergeSources(current.sources, dossier.sources),
      }
      continue
    }

    if (key && indexByName.has(key)) continue
    if (key) indexByName.set(key, preserved.length)
    preserved.push(cloneDossier(dossier))
  }

  return preserved
}
