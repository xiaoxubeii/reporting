import { describe, expect, it, vi } from 'vitest'

import type { AIProvider, ToolLoopResult } from '@/lib/ai/types'
import type { BackgroundExecutionContext } from '@/lib/background-jobs/context'
import {
  runDealResearch,
  type DealResearchDependencies,
} from './research'

const CONTEXT = Object.freeze({
  jobId: '842e532a-b848-457a-9b8e-4d6d8da10caf',
  attemptId: '1cd393ce-753b-4021-9848-f41d5205a4c8',
  tokenId: '1cd393ce-753b-4021-9848-f41d5205a4c8',
  audience: 'reporting-deal-research-worker' as const,
  scope: 'deal-research:execute' as const,
  kind: 'deal_research',
  fundId: '2621143a-c9c3-4079-b52d-a9a935332ff5',
  actor: Object.freeze({ type: 'system' as const }),
  payload: Object.freeze({ dealId: 'f13aa191-56ac-4fb8-8eaa-bce047791467' }),
  sourceMode: 'public' as const,
  leaseExpiresAt: new Date(Date.now() + 300_000).toISOString(),
  access: null,
}) satisfies BackgroundExecutionContext

const PARAMS = {
  fundId: CONTEXT.fundId,
  dealId: CONTEXT.payload.dealId,
  companyName: 'Example Health',
  companyUrl: 'https://example.com',
  companyDomain: 'example.com',
  founderName: 'Ada Example',
  founderEmail: 'private@example.com',
  industry: 'health',
  stage: 'seed',
  companySummary: 'Reference only',
  executionContext: CONTEXT,
}

const SOURCE = Object.freeze({
  id: 'web-1', title: 'Example evidence', url: 'https://news.example/evidence',
  snippet: 'Independent source', query: 'Example Health funding', sources: [{ id: 'web' as const, label: 'Web' }],
})

function result(overrides: Partial<ToolLoopResult> = {}): ToolLoopResult {
  return {
    text: JSON.stringify({
      founder_background: 'Verified background', prior_companies: [],
      traction_corroboration: 'Evidence found', market_context: 'Market evidence',
      red_flags: [], open_questions: ['Ask'], summary: 'Grounded summary',
      evidence_source_ids: ['web-1'],
    }),
    usage: { inputTokens: 10, outputTokens: 20 },
    truncated: false,
    toolCalls: [{ id: 'call_1', name: 'reporting_search', input: { topic: 'company' }, resultPreview: '{}', isError: false }],
    ...overrides,
  }
}

function dependencies(options: {
  providerType?: string
  provider?: Partial<AIProvider>
  loopResult?: ToolLoopResult
  sources?: readonly typeof SOURCE[]
  persistResult?: boolean
} = {}): DealResearchDependencies {
  const createToolLoop = vi.fn(async () => options.loopResult ?? result())
  const provider = {
    supportsToolLoop: true,
    createToolLoop,
    ...options.provider,
  } as AIProvider
  return {
    getProvider: vi.fn(async () => ({ provider, providerType: options.providerType ?? 'openrouter', model: 'test-model' })),
    createSearchTool: vi.fn(() => ({
      definition: { name: 'reporting_search', description: 'Search', inputSchema: { type: 'object' } },
      execute: vi.fn(async () => '{}'),
      collectedSources: () => options.sources ?? [SOURCE],
    })),
    persist: vi.fn(async () => options.persistResult ?? true),
    logUsage: vi.fn(),
  }
}

describe('runDealResearch', () => {
  it('uses the configured OpenAI-compatible provider tool loop and persists only collected Search evidence', async () => {
    const deps = dependencies({ providerType: 'openrouter' })
    const outcome = await runDealResearch({} as never, PARAMS, deps)
    expect(outcome).toEqual({ status: 'done' })
    const provider = (await vi.mocked(deps.getProvider)({} as never, '')).provider
    const call = vi.mocked(provider.createToolLoop!).mock.calls[0][0]
    expect(call.tools?.[0].name).toBe('reporting_search')
    expect(String(call.content)).not.toContain(PARAMS.founderEmail)
    expect(call.system).toContain('untrusted external evidence')
    expect(deps.persist).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({
      status: 'done',
      sources: [SOURCE],
      summary: 'Grounded summary',
    }))
    expect(deps.logUsage).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openrouter' }))
  })

  it('fails closed for unsupported providers and zero-tool or empty-evidence runs', async () => {
    const unsupported = dependencies({ provider: { supportsToolLoop: false, createToolLoop: undefined } })
    await expect(runDealResearch({} as never, PARAMS, unsupported)).resolves.toEqual({ status: 'skipped' })
    expect(unsupported.persist).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ status: 'skipped' }))

    const ollama = dependencies({ providerType: 'ollama' })
    await expect(runDealResearch({} as never, PARAMS, ollama)).resolves.toEqual({ status: 'skipped' })
    const ollamaProvider = (await vi.mocked(ollama.getProvider)({} as never, '')).provider
    expect(ollamaProvider.createToolLoop).not.toHaveBeenCalled()

    const zeroTool = dependencies({ loopResult: result({ toolCalls: [] }) })
    await expect(runDealResearch({} as never, PARAMS, zeroTool)).resolves.toEqual({ status: 'skipped' })
    expect(zeroTool.persist).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ status: 'skipped', sources: [] }))

    const empty = dependencies({ sources: [] })
    await expect(runDealResearch({} as never, PARAMS, empty)).resolves.toEqual({ status: 'skipped' })
    expect(empty.persist).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ status: 'skipped', sources: [] }))
  })

  it('rejects fabricated citations and stale final writes', async () => {
    const fabricated = dependencies({
      loopResult: result({ text: JSON.stringify({
        founder_background: '', prior_companies: [], traction_corroboration: '', market_context: '',
        red_flags: [], open_questions: [], summary: 'Invented', evidence_source_ids: ['fabricated-source'],
      }) }),
    })
    await expect(runDealResearch({} as never, PARAMS, fabricated)).resolves.toMatchObject({ status: 'failed' })
    expect(fabricated.persist).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ status: 'failed', sources: [SOURCE] }))

    const stale = dependencies({ persistResult: false })
    await expect(runDealResearch({} as never, PARAMS, stale)).resolves.toMatchObject({ status: 'failed', error: 'stale attempt' })
  })
})
