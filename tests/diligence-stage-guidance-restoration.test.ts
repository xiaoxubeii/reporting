import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('diligence stage-guidance restoration contract', () => {
  it('removes the project-wide analysis preferences UI and deal field', () => {
    const detail = read('app/(app)/diligence/[id]/deal-detail.tsx')

    expect(detail).not.toContain('AnalysisPreferencesSheet')
    expect(detail).not.toContain('analysis_preferences')
    expect(detail).not.toContain('analysis-preferences')
  })

  it('restores inline guidance for ingest, research, score, and draft workflows', () => {
    const detail = read('app/(app)/diligence/[id]/deal-detail.tsx')
    const memoConfig = read('components/diligence/memo-config-panel.tsx')

    expect(detail).toContain('guidanceStage="ingest"')
    expect(detail).toContain('guidanceStage="research"')
    expect(detail).toContain('guidanceStage="score"')
    expect(memoConfig).toContain('guidanceStage="draft"')
  })

  it('keeps the inline editor bound to the exact selected fund stage', () => {
    const stageGuidance = read('components/diligence/stage-guidance.tsx')

    expect(stageGuidance).toContain('b?.guidance?.[stage]')
    expect(stageGuidance).toContain('guidance: { [stage]: value }')
    expect(stageGuidance).toContain("fetch('/api/diligence/prompts'")
  })

  it('removes project preference handling from the deal API and prompt builder', () => {
    const route = read('app/api/diligence/[id]/route.ts')
    const systemPrompt = read('lib/memo-agent/prompts/system.ts')

    expect(route).not.toContain('analysis_preferences')
    expect(systemPrompt).not.toContain('analysis_preferences')
    expect(systemPrompt).not.toContain('diligence_deals')
    expect(systemPrompt).toContain(".from('memo_agent_prompts')")
    expect(systemPrompt).toContain(".eq('stage', params.stage)")
  })

  it('drops stored project preferences without translating them', () => {
    const migration = read('supabase/migrations/20260729020000_restore_stage_guidance.sql')

    expect(migration).toMatch(/drop column if exists analysis_preferences/i)
    expect(migration).not.toMatch(/insert\s+into\s+public\.memo_agent_prompts/i)
    expect(migration).not.toMatch(/update\s+public\.memo_agent_prompts/i)
  })

  it('labels inline guidance as fund-wide in both supported languages', () => {
    const en = JSON.parse(read('messages/en.json'))
    const zh = JSON.parse(read('messages/zh-CN.json'))

    expect(en.Diligence.stageGuidance.description).toContain('every deal in this fund')
    expect(zh.Diligence.stageGuidance.description).toContain('该基金的所有项目')
    expect(en.Diligence.analysisPreferences).toBeUndefined()
    expect(zh.Diligence.analysisPreferences).toBeUndefined()
  })
})
