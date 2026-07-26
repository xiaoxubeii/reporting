import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/memo-agent/firm-schemas', () => ({
  ensureDefaults: vi.fn(async () => undefined),
  getActiveSchemas: vi.fn(async () => ({})),
}))

vi.mock('@/lib/memo-agent/style-anchors', () => ({
  buildVoiceSynthesisBlock: vi.fn(async () => ({ confidence: 'unavailable', block: '' })),
}))

import { buildSystemPrompt, type StageName } from './system'

function fakeAdmin() {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: null })),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return { from: vi.fn(() => chain) } as any
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
})
