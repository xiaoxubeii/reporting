import { describe, expect, it, vi } from 'vitest'

import type { BackgroundExecutionContext } from '@/lib/background-jobs/context'
import { verifyBackgroundJobToken } from '@/lib/background-jobs/token'
import { createReportingSearchTool } from './research-search-tool'

const SIGNING_KEY_FIXTURE = ['background-job-test', 'signing-key', '0123456789'].join('-')
const NOW = new Date('2026-07-25T13:00:00.000Z')
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
  leaseExpiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
  access: null,
}) satisfies BackgroundExecutionContext

const DEAL = {
  companyName: 'Example Health',
  companyDomain: 'example.com',
  companyUrl: 'https://example.com',
  founderName: 'Ada Lovelace',
}

const SEARCH_BODY = {
  success: true,
  data: {
    results: [{
      id: 'web-1', primaryOrigin: 'web', origins: ['web'], title: 'Example Health raises seed',
      url: 'https://news.example/article', snippet: 'Independent evidence', sources: [{ id: 'web', label: 'Web' }],
    }],
    sources: [{ id: 'web', status: 'ok', resultCount: 1 }],
    partial: false,
  },
  error: null,
}

describe('reporting_search Research tool', () => {
  it('uses a server-derived call id, per-hop Search token, fixed URL, and collects citable evidence', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(SEARCH_BODY), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    const tool = createReportingSearchTool({
      context: CONTEXT,
      deal: DEAL,
      now: () => NOW,
      fetchImpl,
      env: {
        BACKGROUND_JOB_TOKEN_SECRET: SIGNING_KEY_FIXTURE,
        BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example',
      },
    })
    const output = await tool.execute({ id: 'provider_call_1', name: 'reporting_search', input: { topic: 'company' } })
    expect(JSON.parse(output)).toMatchObject({
      security: { untrustedExternalEvidence: true },
      evidence: { results: [{ title: 'Example Health raises seed' }] },
    })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit]
    expect(url).toBe('https://reporting.example/api/search')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({ query: '"Example Health" company news funding', toolCallId: expect.stringMatching(/^search_[a-f0-9]{40}$/) })
    expect(body.toolCallId).not.toContain('provider_call_1')
    const token = String((init.headers as Record<string, string>).authorization).replace('Bearer ', '')
    await expect(verifyBackgroundJobToken(token, { audience: 'reporting-search', now: NOW, secret: SIGNING_KEY_FIXTURE }))
      .resolves.toMatchObject({ jobId: CONTEXT.jobId, attemptId: CONTEXT.attemptId, tokenId: body.toolCallId })
    expect(tool.collectedSources()).toEqual([
      expect.objectContaining({ title: 'Example Health raises seed', url: 'https://news.example/article' }),
    ])
  })

  it('accepts only a code-owned topic and never forwards model-authored query text', async () => {
    const fetchImpl = vi.fn()
    const tool = createReportingSearchTool({
      context: CONTEXT, deal: DEAL, now: () => NOW, fetchImpl,
      env: { BACKGROUND_JOB_TOKEN_SECRET: SIGNING_KEY_FIXTURE, BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example' },
    })
    for (const input of [
      { query: 'Example Health confidential customer list' },
      { topic: 'other' },
      { topic: 'company', query: 'private pitch text' },
    ]) {
      await expect(tool.execute({ id: 'call_1', name: 'reporting_search', input })).rejects.toThrow()
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('retries HTTP with the same idempotency body and enforces three calls locally', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockImplementation(async () => new Response(JSON.stringify(SEARCH_BODY), { status: 200 }))
    const tool = createReportingSearchTool({
      context: CONTEXT, deal: DEAL, now: () => NOW, fetchImpl,
      env: { BACKGROUND_JOB_TOKEN_SECRET: SIGNING_KEY_FIXTURE, BACKGROUND_JOB_INTERNAL_ORIGIN: 'https://reporting.example' },
    })
    await tool.execute({ id: 'call_retry', name: 'reporting_search', input: { topic: 'website' } })
    expect(fetchImpl.mock.calls[0][1].body).toBe(fetchImpl.mock.calls[1][1].body)
    await tool.execute({ id: 'call_2', name: 'reporting_search', input: { topic: 'market' } })
    await tool.execute({ id: 'call_3', name: 'reporting_search', input: { topic: 'founder' } })
    await expect(tool.execute({ id: 'call_4', name: 'reporting_search', input: { topic: 'competitors' } }))
      .rejects.toThrow('limit')
  })
})
