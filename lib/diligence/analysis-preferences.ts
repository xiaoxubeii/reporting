export const ANALYSIS_FOCUS_AREAS = [
  'technology',
  'market',
  'financials',
  'regulatory',
] as const

export type AnalysisFocusArea = typeof ANALYSIS_FOCUS_AREAS[number]
export type AnalysisDepth = 'quick' | 'standard' | 'deep'

export interface AnalysisPreferences {
  focus_areas: AnalysisFocusArea[]
  depth: AnalysisDepth
  custom_instructions: string
}

export const DEFAULT_ANALYSIS_PREFERENCES: AnalysisPreferences = {
  focus_areas: [],
  depth: 'standard',
  custom_instructions: '',
}

const DEPTHS = new Set<AnalysisDepth>(['quick', 'standard', 'deep'])
const FOCUS_AREAS = new Set<AnalysisFocusArea>(ANALYSIS_FOCUS_AREAS)

export function normalizeAnalysisPreferences(value: unknown): AnalysisPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_ANALYSIS_PREFERENCES }
  }

  const input = value as Record<string, unknown>
  const focusAreas = Array.isArray(input.focus_areas)
    ? Array.from(new Set(input.focus_areas.filter(
        (area): area is AnalysisFocusArea => typeof area === 'string' && FOCUS_AREAS.has(area as AnalysisFocusArea),
      )))
    : []
  const depth = typeof input.depth === 'string' && DEPTHS.has(input.depth as AnalysisDepth)
    ? input.depth as AnalysisDepth
    : DEFAULT_ANALYSIS_PREFERENCES.depth
  const customInstructions = typeof input.custom_instructions === 'string'
    ? input.custom_instructions.trim().slice(0, 4000)
    : ''

  return {
    focus_areas: focusAreas,
    depth,
    custom_instructions: customInstructions,
  }
}

const FOCUS_LABELS: Record<AnalysisFocusArea, string> = {
  technology: 'technology and product',
  market: 'market and competition',
  financials: 'financials and unit economics',
  regulatory: 'regulatory and compliance',
}

const DEPTH_INSTRUCTIONS: Record<AnalysisDepth, string> = {
  quick: 'Prioritize material signals, blockers, and unanswered questions. Keep analysis concise.',
  standard: 'Use a balanced level of detail and cover material evidence, risks, and open questions.',
  deep: 'Analyze evidence thoroughly, test claims across sources, and surface second-order risks and inconsistencies.',
}

export function buildAnalysisPreferencesPrompt(value: unknown): string {
  const preferences = normalizeAnalysisPreferences(value)
  const lines = [
    '=== PROJECT ANALYSIS PREFERENCES (partner-authored; apply to this deal only) ===',
    `Analysis depth: ${preferences.depth}. ${DEPTH_INSTRUCTIONS[preferences.depth]}`,
  ]

  if (preferences.focus_areas.length > 0) {
    lines.push(`Areas to emphasize: ${preferences.focus_areas.map(area => FOCUS_LABELS[area]).join(', ')}.`)
  }
  if (preferences.custom_instructions) {
    lines.push(`Additional project guidance:\n${preferences.custom_instructions}`)
  }

  return lines.join('\n')
}
