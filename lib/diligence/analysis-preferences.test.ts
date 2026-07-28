import { describe, expect, it } from 'vitest'
import {
  buildAnalysisPreferencesPrompt,
  normalizeAnalysisPreferences,
} from './analysis-preferences'

describe('analysis preferences', () => {
  it('normalizes untrusted persisted values', () => {
    expect(normalizeAnalysisPreferences({
      focus_areas: ['market', 'market', 'unknown'],
      depth: 'deep',
      custom_instructions: '  Verify clinical claims.  ',
    })).toEqual({
      focus_areas: ['market'],
      depth: 'deep',
      custom_instructions: 'Verify clinical claims.',
    })
  })

  it('builds a project-scoped prompt block', () => {
    const prompt = buildAnalysisPreferencesPrompt({
      focus_areas: ['technology', 'regulatory'],
      depth: 'quick',
      custom_instructions: 'Check the FDA pathway.',
    })

    expect(prompt).toContain('PROJECT ANALYSIS PREFERENCES')
    expect(prompt).toContain('technology and product')
    expect(prompt).toContain('regulatory and compliance')
    expect(prompt).toContain('Check the FDA pathway.')
  })
})
