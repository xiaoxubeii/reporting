import { describe, expect, it, vi } from 'vitest'

import type { BackgroundExecutionContext } from '@/lib/background-jobs/context'
import { ReportingSearchSessionState, createReportingSearchTool } from './reporting-search-tool'

const NOW = new Date('2026-07-28T10:00:00.000Z')
const CONTEXT = Object.freeze({
  jobId: '842e532a-b848-457a-9b8e-4d6d8da10caf',
  attemptId: '1cd393ce-753b-4021-9848-f41d5205a4c8',
  tokenId: '1cd393ce-753b-4021-9848-f41d5205a4c8',
  audience: 'reporting-memo-research-worker' as const,
  scope: 'memo-research:execute' as const,
  kind: 'memo_research',
  fundId: '2621143a-c9c3-4079-b52d-a9a935332ff5',
  actor: Object.freeze({ type: 'user' as const, userId: '5b0ee23f-2a2f-4a4d-9d6f-098d89904d89' }),
  payload: Object.freeze({
    memoJobId: 'b898d919-d79f-482d-9faf-c59d3994be1f',
    dealId: 'f13aa191-56ac-4fb8-8eaa-bce047791467',
    draftId: '77630c6e-6229-4203-8db4-f4be1c3046c7',
  }),
  sourceMode: 'public' as const,
  leaseExpiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
  access: {} as never,
}) satisfies BackgroundExecutionContext

const ENV = {
  BACKGROUND_JOB_TOKEN_SECRET: 'background-job-test-signing-key-0123456789',
  BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example',
}

function success(id: string) {
  return new Response(JSON.stringify({
    success: true,
    data: {
      results: [{ id, primaryOrigin: 'web', origins: ['web'], title: `Evidence ${id}`, url: `https://evidence.example/${id}`, sources: [{ id: 'web', label: 'Web' }] }],
      sources: [{ id: 'web', status: 'ok', resultCount: 1 }],
      partial: false,
    },
    error: null,
  }), { status: 200 })
}

describe('Memo Reporting Search tool contract', () => {
  it('builds public queries from an enum and rejects model-authored private query text', async () => {
    const fetchImpl = vi.fn(async () => success('clinical-1'))
    const tool = createReportingSearchTool({
      context: CONTEXT,
      deal: { companyName: 'Confidential Project Atlas', companyDomain: null, companyUrl: 'https://cardio-health.com/about', founderName: null },
      profile: 'memo', namespace: 'claims', state: new ReportingSearchSessionState(),
      now: () => NOW, fetchImpl, env: ENV,
    })
    await tool.execute({ id: 'tool_1', name: 'reporting_search', input: { topic: 'clinical' } })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.query).toBe('cardio-health.com clinical evidence trials outcomes')
    expect(body.query).not.toContain('Confidential Project Atlas')
    await expect(tool.execute({ id: 'tool_2', name: 'reporting_search', input: { query: 'secret patient data' } }))
      .rejects.toThrow('arguments')
    await expect(tool.execute({ id: 'tool_3', name: 'reporting_search', input: { topic: 'financing' } }))
      .rejects.toThrow('topic')
  })

  it('does not make a Memo Search request when no public website hostname is available', async () => {
    const fetchImpl = vi.fn(async () => success('should-not-run'))
    const tool = createReportingSearchTool({
      context: CONTEXT,
      deal: { companyName: 'Confidential Project Atlas', companyDomain: null, companyUrl: null, founderName: null },
      profile: 'memo', namespace: 'claims', state: new ReportingSearchSessionState(),
      now: () => NOW, fetchImpl, env: ENV,
    })
    await expect(tool.execute({ id: 'tool_1', name: 'reporting_search', input: { topic: 'clinical' } }))
      .rejects.toThrow('safe public Search identifier')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('namespaces provider call ids and shares one three-call budget across parallel sub-calls', async () => {
    const state = new ReportingSearchSessionState()
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      return success(body.query.includes('competitors') ? 'competitor-1' : 'source-1')
    })
    const make = (namespace: string) => createReportingSearchTool({
      context: CONTEXT,
      deal: { companyName: 'Cardio AI', companyDomain: null, companyUrl: 'https://cardio-health.com', founderName: null },
      profile: 'memo', namespace, state, now: () => NOW, fetchImpl, env: ENV,
    })
    const claims = make('claims')
    const competitors = make('competitors')
    const founders = make('founders')
    await claims.execute({ id: 'same_provider_id', name: 'reporting_search', input: { topic: 'clinical' } })
    await competitors.execute({ id: 'same_provider_id', name: 'reporting_search', input: { topic: 'competitors' } })
    await founders.execute({ id: 'same_provider_id', name: 'reporting_search', input: { topic: 'founder' } })
    const ids = fetchImpl.mock.calls.map(call => JSON.parse(String(call[1]?.body)).toolCallId)
    expect(new Set(ids).size).toBe(3)
    await expect(claims.execute({ id: 'fourth', name: 'reporting_search', input: { topic: 'market' } }))
      .rejects.toThrow('limit')
    expect(claims.searchCount()).toBe(1)
    expect(state.calls).toBe(3)
  })

  it('returns explicit untrusted evidence and only exact source ids collected in that sub-call', async () => {
    const state = new ReportingSearchSessionState()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(success('claims-1'))
      .mockResolvedValueOnce(success('founders-1'))
    const make = (namespace: string) => createReportingSearchTool({
      context: CONTEXT,
      deal: { companyName: 'Cardio AI', companyDomain: null, companyUrl: 'https://cardio-health.com', founderName: null },
      profile: 'memo', namespace, state, now: () => NOW, fetchImpl, env: ENV,
    })
    const claims = make('claims')
    const founders = make('founders')
    const claimsOutput = JSON.parse(await claims.execute({ id: 'c1', name: 'reporting_search', input: { topic: 'company' } }))
    const foundersOutput = JSON.parse(await founders.execute({ id: 'f1', name: 'reporting_search', input: { topic: 'founder' } }))
    expect(claimsOutput.security.untrustedExternalEvidence).toBe(true)
    expect(claimsOutput.citation_contract.allowed_source_ids).toEqual(['claims-1'])
    expect(foundersOutput.citation_contract.allowed_source_ids).toEqual(['founders-1'])
    expect(founders.collectedSources().map(source => source.id)).toEqual(['claims-1', 'founders-1'])
  })

  it('keeps every accepted ID resolvable when two results share one URL', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(success('source-a'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: {
          results: [{ id: 'source-b', primaryOrigin: 'web', origins: ['web'], title: 'Second', url: 'https://evidence.example/source-a', sources: [{ id: 'web', label: 'Web' }] }],
          sources: [{ id: 'web', status: 'ok', resultCount: 1 }],
          partial: false,
        },
        error: null,
      }), { status: 200 }))
    const tool = createReportingSearchTool({
      context: CONTEXT,
      deal: { companyName: null, companyDomain: null, companyUrl: 'https://cardio-health.com', founderName: null },
      profile: 'memo', namespace: 'claims', state: new ReportingSearchSessionState(),
      now: () => NOW, fetchImpl, env: ENV,
    })
    await tool.execute({ id: 'one', name: 'reporting_search', input: { topic: 'claim_verification' } })
    await tool.execute({ id: 'two', name: 'reporting_search', input: { topic: 'intellectual_property' } })
    expect(tool.allowedSourceIds()).toEqual(['source-a', 'source-b'])
    expect(tool.collectedSources().map(source => source.id)).toEqual(['source-a', 'source-b'])
  })

  it('normalizes a public www hostname and excludes LinkedIn from Memo evidence', async () => {
    const fetchImpl = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args
      return new Response(JSON.stringify({
      success: true,
      data: {
        results: [
          { id: 'linkedin-1', primaryOrigin: 'web', origins: ['web'], title: 'LinkedIn profile', url: 'https://www.linkedin.com/in/example', sources: [{ id: 'web', label: 'Web' }] },
          { id: 'public-1', primaryOrigin: 'web', origins: ['web'], title: 'Public evidence', url: 'https://evidence.example/article', sources: [{ id: 'web', label: 'Web' }] },
        ],
        sources: [{ id: 'web', status: 'ok', resultCount: 2 }],
        partial: false,
      },
      error: null,
      }), { status: 200 })
    })
    const tool = createReportingSearchTool({
      context: CONTEXT,
      deal: { companyName: null, companyDomain: null, companyUrl: 'https://www.cardio-health.com', founderName: null },
      profile: 'memo', namespace: 'founders', state: new ReportingSearchSessionState(),
      now: () => NOW, fetchImpl, env: ENV,
    })

    const output = JSON.parse(await tool.execute({ id: 'founder-1', name: 'reporting_search', input: { topic: 'founder' } }))
    const request = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))
    expect(request.query).toBe('cardio-health.com founders leadership background')
    expect(output.evidence.results.map((result: { id: string }) => result.id)).toEqual(['public-1'])
    expect(output.citation_contract.allowed_source_ids).toEqual(['public-1'])
    expect(tool.collectedSources().map(source => source.id)).toEqual(['public-1'])
  })

  it('fails closed when Search returns a malformed hit or source entry', async () => {
    const malformed = [
      { id: 42, primaryOrigin: 'web', origins: ['web'], title: 'Wrong id', sources: [{ id: 'web', label: 'Web' }] },
      { id: 'bad-url', primaryOrigin: 'web', origins: ['web'], title: 'Wrong URL', url: 'javascript:alert(1)', sources: [{ id: 'web', label: 'Web' }] },
      { id: 'bad-source', primaryOrigin: 'web', origins: ['web'], title: 'Wrong source', url: 'https://evidence.example', sources: [{ id: 'attacker', label: 7 }] },
    ]

    for (let index = 0; index < malformed.length; index += 1) {
      const hit = malformed[index]
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
        success: true,
        data: {
          results: [hit],
          sources: [{ id: 'web', status: 'ok', resultCount: 1 }],
          partial: false,
        },
        error: null,
      }), { status: 200 }))
      const tool = createReportingSearchTool({
        context: CONTEXT,
        deal: { companyName: null, companyDomain: null, companyUrl: 'https://cardio-health.com', founderName: null },
        profile: 'memo', namespace: `malformed_${index}`, state: new ReportingSearchSessionState(),
        now: () => NOW, fetchImpl, env: ENV,
      })

      await expect(tool.execute({ id: `bad_${index}`, name: 'reporting_search', input: { topic: 'company' } }))
        .rejects.toThrow('invalid')
      expect(tool.collectedSources()).toEqual([])
    }
  })
})
