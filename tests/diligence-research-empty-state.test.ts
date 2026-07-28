import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const detailSource = readFileSync(path.join(root, 'app/(app)/diligence/[id]/deal-detail.tsx'), 'utf8')
const en = JSON.parse(readFileSync(path.join(root, 'messages/en.json'), 'utf8'))
const zh = JSON.parse(readFileSync(path.join(root, 'messages/zh-CN.json'), 'utf8'))

describe('diligence research empty state', () => {
  it('distinguishes an unstarted research run from running and failed jobs', () => {
    expect(detailSource).toContain("const researchFailed = job?.kind === 'research' && job.status === 'failed'")
    expect(detailSource).toContain('draftLoaded && status !== null && !hasPersistedResearch && !research && !isResearchInFlight && !researchFailed')
    expect(detailSource).toContain("{t('external.notRun')}")
  })

  it('keeps generated result cards hidden but shows the team pre-research guidance', () => {
    const researchTab = detailSource.slice(
      detailSource.indexOf('function ResearchTab('),
      detailSource.indexOf('function ExpertValidationTab('),
    )

    expect(researchTab).toContain('research && (')
    expect(researchTab).toContain("title={t('competitive.title')}")
    expect(researchTab.indexOf('research && (')).toBeLessThan(researchTab.indexOf("title={t('competitive.title')}"))
    expect(researchTab).not.toContain('{research && (\n        <FounderTeamSection')
    expect(researchTab).toContain('<FounderTeamSection')
    expect(researchTab).toContain('research={research}')
  })

  it('uses separate copy for unstarted and completed-empty states in both locales', () => {
    for (const messages of [en, zh]) {
      const research = messages.Diligence.dealDetail.research
      expect(research.external.notRun).toBeTruthy()
      expect(research.external.noEvidence).toBeTruthy()
      expect(research.external.notRun).not.toBe(research.external.noEvidence)
      expect(research.competitive.empty).not.toMatch(/run external research|运行外部研究/i)
    }
    expect(detailSource).toContain('const hasExternalEvidence = research.findings.length > 0')
    expect(detailSource).toContain('(research.founder_dossiers ?? []).some')
    expect(detailSource).toContain('{!hasExternalEvidence && <p')
    expect(detailSource).toContain("{t('external.noEvidence')}")
  })
})
