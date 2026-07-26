import { describe, expect, it } from 'vitest'
import { renderMarkdown, type RenderInput } from './markdown'

function makeInput(outputLanguage: RenderInput['outputLanguage']): RenderInput {
  return {
    outputLanguage,
    memo: {
      header: { company_name: 'Acme', memo_date: '2026-07-26' },
      paragraphs: [{
        id: 'p1',
        section_id: 'executive_summary',
        order: 1,
        prose: outputLanguage === 'zh-CN' ? '这是摘要。' : 'This is the summary.',
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
        rationale: outputLanguage === 'zh-CN' ? '待判断。' : 'Pending judgement.',
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
    - id: appendix
      title: Appendix
      kind: structured
`,
    rubricYaml: '',
    isDraft: true,
    dealName: 'Acme',
    draftVersion: 'v1',
  }
}

describe('renderMarkdown output language', () => {
  it('localizes renderer-owned labels while preserving machine identifiers in Chinese', () => {
    const markdown = renderMarkdown(makeInput('zh-CN'))

    expect(markdown).toContain('# 草稿 — 尚未定稿')
    expect(markdown).toContain('项目负责人: *[待合伙人填写]*')
    expect(markdown).toContain('## 执行摘要')
    expect(markdown).toContain('## 评分摘要')
    expect(markdown).toContain('| 维度 | 模式 | 评分 | 置信度 | 理由 |')
    expect(markdown).toContain('| team_quality | 仅合伙人 | *[合伙人]* |')
    expect(markdown).toContain('[预测] · ⚠ 未验证 · †存在矛盾')
    expect(markdown).toContain('## 附录与引用')
    expect(markdown).toContain('*暂无引用。*')
  })

  it('keeps the existing English render labels for English drafts', () => {
    const markdown = renderMarkdown(makeInput('en'))

    expect(markdown).toContain('# DRAFT — not finalized')
    expect(markdown).toContain('Deal lead: *[Partner to complete]*')
    expect(markdown).toContain('## Executive Summary')
    expect(markdown).toContain('| Dimension | Mode | Score | Confidence | Rationale |')
    expect(markdown).toContain('[projection] · ⚠ unverified · †contradiction')
  })
})
