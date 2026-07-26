import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('diligence output language generation boundaries', () => {
  it('passes a persisted language into every memo-agent prompt call', () => {
    const files = [
      'lib/memo-agent/stages/ingest.ts',
      'lib/memo-agent/stages/research.ts',
      'lib/memo-agent/stages/checklist-assessment.ts',
      'lib/memo-agent/stages/qa.ts',
      'lib/memo-agent/stages/score.ts',
      'lib/memo-agent/stages/draft.ts',
    ]
    const source = files.map(read).join('\n')
    const calls = Array.from(source.matchAll(/buildSystemPrompt\(\{([^}]+)\}\)/g))
    expect(calls).toHaveLength(8)
    for (const call of calls) expect(call[1]).toContain('outputLanguage')
    expect(source).toContain('loadDiligenceOutputLanguage')
    expect(source).not.toMatch(/LOCALE_COOKIE_NAME|accept-language|NEXT_LOCALE/)
  })

  it('covers direct expert and partner-QA generation without a browser locale', () => {
    for (const file of ['lib/expert-validation/generation.ts', 'lib/diligence/qa-answer.ts']) {
      const source = read(file)
      expect(source).toContain('loadDiligenceOutputLanguage')
      expect(source).toContain('buildOutputLanguageInstruction')
      expect(source).not.toMatch(/LOCALE_COOKIE_NAME|accept-language|NEXT_LOCALE/)
    }
  })

  it('snapshots first-draft language and render jobs read the draft snapshot', () => {
    const ingest = read('lib/memo-agent/stages/ingest.ts')
    const render = read('lib/memo-agent/jobs/render-job.ts')
    expect(ingest).toContain('output_language: outputLanguage')
    expect(render).toContain(".select('id, draft_version, is_draft, output_language")
    expect(render).toContain('resolveDraftOutputLanguage')
  })

  it('stores checklist assessment evidence on the language-version draft', () => {
    const checklist = read('lib/memo-agent/stages/checklist-assessment.ts')
    expect(checklist).toContain('checklist_assessment_output')
    expect(checklist).toContain('output_language: outputLanguage')
    expect(checklist).toContain('items: persistedAssessments')
  })

  it('lets the server require confirmation and does not call a skipped rerun started', () => {
    const detail = read('app/(app)/diligence/[id]/deal-detail.tsx')
    expect(detail).toContain("result.code === 'confirmation_required'")
    expect(detail).toContain('expected_draft_id: expectedDraftId')
    expect(detail).toContain('requestLanguageChange(true, result.expected_draft_id)')
    expect(detail).toContain('ingestResult.skipped')
  })
})
