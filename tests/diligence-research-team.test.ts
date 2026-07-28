import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const detail = readFileSync(path.join(root, 'app/(app)/diligence/[id]/deal-detail.tsx'), 'utf8')
const english = JSON.parse(readFileSync(path.join(root, 'messages/en.json'), 'utf8'))
const chinese = JSON.parse(readFileSync(path.join(root, 'messages/zh-CN.json'), 'utf8'))

describe('diligence Research team workspace', () => {
  it('keeps founder dossiers inside Research instead of a top-level tab', () => {
    expect(detail).toContain("'Research', 'Expert Validation', 'Scoring'")
    expect(detail).not.toContain("activeTab === 'Founders'")
    expect(detail).not.toContain('function FoundersTab(')

    const researchTab = detail.slice(
      detail.indexOf('function ResearchTab('),
      detail.indexOf('function ExpertValidationTab('),
    )
    expect(researchTab).toContain('<FounderTeamSection')
    expect(researchTab).toContain('research={research}')
    expect(researchTab).toContain('onPatch={patchResearch}')
    expect(researchTab.indexOf("title={t('competitive.title')}")).toBeLessThan(
      researchTab.indexOf('<FounderTeamSection'),
    )
    expect(researchTab).not.toContain('{research && (\n        <FounderTeamSection')
    expect(researchTab).toContain('editable={editable && !isResearchInFlight}')
  })

  it('uses a compact pre-research state and contextual side sheet', () => {
    expect(detail).toContain("t('team.runResearchFirst')")
    expect(detail).toContain('function FounderDossierSheet(')
    expect(detail).toContain('<SheetContent')
    expect(detail).toContain('side="right"')
    expect(detail).toContain("dialogTitle={t('editorTitle')}")
    expect(detail).toContain('research && editable ? (')
    expect(detail).toContain('await onPatch({ founder_dossiers: next })')
    expect(detail).toContain('aria-busy={saving}')
    expect(detail).toContain("role=\"alert\"")
    expect(detail).toContain("setNameError(t('nameRequired'))")
    expect(detail).not.toContain("founder_name: name.trim() || t('unnamed')")
  })

  it('ships matching English and Simplified Chinese team copy', () => {
    expect(english.Diligence.dealDetail.research.team.title).toBe('Founders & Core Team')
    expect(chinese.Diligence.dealDetail.research.team.title).toBe('创始人与核心团队')
    expect(english.Diligence.dealDetail.research.team.runResearchFirst).toBeTruthy()
    expect(chinese.Diligence.dealDetail.research.team.runResearchFirst).toBeTruthy()
    expect(Object.keys(chinese.Diligence.dealDetail.founders).sort()).toEqual(
      Object.keys(english.Diligence.dealDetail.founders).sort(),
    )
  })
})
