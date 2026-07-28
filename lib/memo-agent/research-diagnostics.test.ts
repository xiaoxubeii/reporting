import { describe, expect, it } from 'vitest'

import { summarizeResearchDiagnostics } from './research-diagnostics'

describe('summarizeResearchDiagnostics', () => {
  it('uses accepted source ids and keeps URL-less sources for Reporting Search', () => {
    const summary = summarizeResearchDiagnostics({
      backend: 'reporting',
      findings: [
        { evidence_source_ids: ['source-1'], sources: [{ title: 'No URL', url: null }] },
        { evidence_source_ids: [], sources: [{ title: 'Has URL', url: 'https://example.com' }] },
      ],
      searchSources: [
        { title: 'No URL', url: null },
        { title: 'Has URL', url: 'https://example.com' },
      ],
      legacyWebSources: [{ title: 'Legacy', url: 'https://legacy.example' }],
    })

    expect(summary.groundedFindings).toBe(1)
    expect(summary.sources).toEqual([
      { title: 'No URL', url: null },
      { title: 'Has URL', url: 'https://example.com' },
    ])
  })

  it('falls back to URL semantics for Anthropic and legacy data', () => {
    const summary = summarizeResearchDiagnostics({
      backend: 'anthropic',
      findings: [
        { sources: [{ title: 'Cited', url: 'https://example.com' }] },
        { sources: [{ title: 'Unlinked', url: null }] },
      ],
      legacyWebSources: [{ title: 'Legacy', url: 'https://legacy.example' }],
    })

    expect(summary.groundedFindings).toBe(1)
    expect(summary.sources).toEqual([{ title: 'Legacy', url: 'https://legacy.example' }])
  })
})
