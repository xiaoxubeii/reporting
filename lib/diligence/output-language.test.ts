import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DILIGENCE_OUTPUT_LANGUAGE,
  buildOutputLanguageInstruction,
  decideOutputLanguageChange,
  hasGeneratedArtifacts,
  parseDiligenceOutputLanguage,
  resolveDraftOutputLanguage,
} from './output-language'

describe('parseDiligenceOutputLanguage', () => {
  it('accepts only the two supported contract values', () => {
    expect(parseDiligenceOutputLanguage('en')).toBe('en')
    expect(parseDiligenceOutputLanguage('zh-CN')).toBe('zh-CN')
    expect(parseDiligenceOutputLanguage('zh')).toBeNull()
    expect(parseDiligenceOutputLanguage('EN')).toBeNull()
    expect(parseDiligenceOutputLanguage(undefined)).toBeNull()
    expect(DEFAULT_DILIGENCE_OUTPUT_LANGUAGE).toBe('en')
  })

  it('falls back legacy or missing draft snapshots to English', () => {
    expect(resolveDraftOutputLanguage(null)).toBe('en')
    expect(resolveDraftOutputLanguage({})).toBe('en')
    expect(resolveDraftOutputLanguage({ output_language: 'zh-CN' })).toBe('zh-CN')
    expect(resolveDraftOutputLanguage({ output_language: 'invalid' })).toBe('en')
  })
})

describe('buildOutputLanguageInstruction', () => {
  it('requires English narrative while protecting machine and evidence contracts', () => {
    const prompt = buildOutputLanguageInstruction('en')
    expect(prompt).toContain('English')
    expect(prompt).toContain('JSON keys')
    expect(prompt).toContain('enum')
    expect(prompt).toContain('citation')
    expect(prompt).toContain('verbatim')
  })

  it('requires Simplified Chinese narrative while protecting machine and evidence contracts', () => {
    const prompt = buildOutputLanguageInstruction('zh-CN')
    expect(prompt).toContain('Simplified Chinese')
    expect(prompt).toContain('JSON keys')
    expect(prompt).toContain('proper nouns')
    expect(prompt).toContain('verbatim')
  })
})

describe('hasGeneratedArtifacts', () => {
  it('is false for an empty draft and true for any stored workflow output', () => {
    expect(hasGeneratedArtifacts(null)).toBe(false)
    expect(hasGeneratedArtifacts({
      ingestion_output: null,
      research_output: null,
      qa_answers: [],
      memo_draft_output: null,
    })).toBe(false)
    expect(hasGeneratedArtifacts({ ingestion_output: { documents: [] } })).toBe(true)
    expect(hasGeneratedArtifacts({ checklist_assessment_output: { items: [] } })).toBe(true)
    expect(hasGeneratedArtifacts({ qa_answers: [{ question_id: 'q1' }] })).toBe(true)
    expect(hasGeneratedArtifacts({ memo_draft_output: {} })).toBe(true)
  })
})

describe('decideOutputLanguageChange', () => {
  it('is idempotent for the current language', () => {
    expect(decideOutputLanguageChange({
      currentLanguage: 'zh-CN',
      requestedLanguage: 'zh-CN',
      draft: { ingestion_output: { documents: [] } },
    })).toBe('noop')
  })

  it('updates in place before output exists', () => {
    expect(decideOutputLanguageChange({
      currentLanguage: 'en',
      requestedLanguage: 'zh-CN',
      draft: { qa_answers: [] },
    })).toBe('update_in_place')
  })

  it('creates a version after any output exists or the source is finalized', () => {
    expect(decideOutputLanguageChange({
      currentLanguage: 'en',
      requestedLanguage: 'zh-CN',
      draft: { research_output: { findings: [] }, is_draft: true },
    })).toBe('create_version')
    expect(decideOutputLanguageChange({
      currentLanguage: 'en',
      requestedLanguage: 'zh-CN',
      draft: { is_draft: false },
    })).toBe('create_version')
  })
})
