import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { renderDocx } from './docx'

describe('renderDocx output language', () => {
  it('localizes renderer-owned labels for Chinese drafts', async () => {
    const buffer = await renderDocx({
      outputLanguage: 'zh-CN',
      memo: {
        header: { company_name: 'Acme', memo_date: '2026-07-26' },
        paragraphs: [{
          id: 'p1',
          section_id: 'executive_summary',
          order: 1,
          prose: '这是摘要。',
          sources: [],
          origin: 'agent_drafted',
          confidence: 'medium',
          contains_projection: true,
          contains_unverified_claim: true,
          contains_contradiction: true,
        }],
        partner_attention: [],
        scores: [{
          dimension_id: 'team_quality',
          mode: 'partner_only',
          score: null,
          confidence: null,
          rationale: '待判断。',
          supporting_evidence: [],
        }],
      },
      memoOutputYaml: `memo_structure:
  sections:
    - id: executive_summary
      title: Executive Summary
      kind: prose
    - id: scoring_summary
      title: Scoring Summary
      kind: structured
`,
      isDraft: true,
      dealName: 'Acme',
      draftVersion: 'v1',
    })

    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')!.async('string')

    expect(documentXml).toContain('草稿 — 尚未定稿')
    expect(documentXml).toContain('项目负责人: [待合伙人填写]')
    expect(documentXml).toContain('执行摘要')
    expect(documentXml).toContain('评分摘要')
    expect(documentXml).toContain('维度')
    expect(documentXml).toContain('仅合伙人')
    expect(documentXml).toContain('预测 · 未验证 · 存在矛盾')
    expect(documentXml).toContain('team_quality')
  })
})
