import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/memo-agent/firm-schemas', () => ({
  ensureDefaults: vi.fn(async () => undefined),
  getActiveSchemas: vi.fn(async () => ({})),
}))

vi.mock('@/lib/memo-agent/style-anchors', () => ({
  buildVoiceSynthesisBlock: vi.fn(async () => ({ confidence: 'unavailable', block: '' })),
}))

import { buildSystemPrompt, type StageName } from './system'

function fakeAdmin(guidanceByStage: Partial<Record<StageName, string>> = {}) {
  let selectedStage: StageName | null = null
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: selectedStage && guidanceByStage[selectedStage]
        ? { guidance: guidanceByStage[selectedStage] }
        : null,
    })),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockImplementation((field: string, value: string) => {
    if (field === 'stage') selectedStage = value as StageName
    return chain
  })
  return { from: vi.fn((table: string) => {
    expect(table).toBe('memo_agent_prompts')
    return chain
  }) } as any
}

describe('buildSystemPrompt output language contract', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each<StageName>(['ingest', 'research', 'qa', 'draft', 'score', 'render'])(
    'adds the shared Chinese narrative contract for %s',
    async stage => {
      const { prompt } = await buildSystemPrompt({
        admin: fakeAdmin(),
        fundId: 'fund-1',
        stage,
        outputLanguage: 'zh-CN',
      })
      expect(prompt).toContain('Simplified Chinese')
      expect(prompt).toContain('JSON keys')
      expect(prompt).toContain('enum')
      expect(prompt).toContain('citation')
      expect(prompt).toContain('verbatim')
    },
  )

  it('adds the English narrative contract', async () => {
    const { prompt } = await buildSystemPrompt({
      admin: fakeAdmin(),
      fundId: 'fund-1',
      stage: 'research',
      outputLanguage: 'en',
    })
    expect(prompt).toContain('English (en)')
  })

  it('injects only guidance for the active stage', async () => {
    const { prompt } = await buildSystemPrompt({
      admin: fakeAdmin({
        ingest: 'INGEST-ONLY-GUIDANCE',
        research: 'RESEARCH-ONLY-GUIDANCE',
      }),
      fundId: 'fund-1',
      stage: 'research',
      outputLanguage: 'en',
    })

    expect(prompt).toContain('RESEARCH-ONLY-GUIDANCE')
    expect(prompt).not.toContain('INGEST-ONLY-GUIDANCE')
  })

  it('omits the partner-authored guidance block when the active stage is empty', async () => {
    const { prompt } = await buildSystemPrompt({
      admin: fakeAdmin({ research: '   ' }),
      fundId: 'fund-1',
      stage: 'research',
      outputLanguage: 'en',
    })

    expect(prompt).not.toContain('FUND GUIDANCE FOR THIS STAGE')
  })
})
