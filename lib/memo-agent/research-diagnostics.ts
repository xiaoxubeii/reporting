export interface ResearchDiagnosticSource {
  readonly title: string
  readonly url: string | null
}

interface ResearchDiagnosticFinding {
  readonly evidence_source_ids?: readonly string[]
  readonly sources: readonly ResearchDiagnosticSource[]
}

export function summarizeResearchDiagnostics(input: Readonly<{
  backend: 'reporting' | 'anthropic' | 'none'
  findings: readonly ResearchDiagnosticFinding[]
  searchSources?: readonly ResearchDiagnosticSource[]
  legacyWebSources?: readonly ResearchDiagnosticSource[]
}>): Readonly<{ groundedFindings: number; sources: readonly ResearchDiagnosticSource[] }> {
  const groundedFindings = input.backend === 'reporting'
    ? input.findings.filter(finding => (finding.evidence_source_ids?.length ?? 0) > 0).length
    : input.findings.filter(finding => finding.sources.some(source => !!source.url)).length
  const sources = input.searchSources
    ? input.searchSources.map(source => Object.freeze({ title: source.title, url: source.url }))
    : (input.legacyWebSources ?? []).map(source => Object.freeze({ title: source.title, url: source.url }))
  return Object.freeze({ groundedFindings, sources: Object.freeze(sources) })
}
