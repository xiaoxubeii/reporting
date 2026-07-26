// @vitest-environment jsdom

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExploreDiscovery } from '@/components/feeds/explore-discovery'

vi.mock('next-intl', () => ({
  useTranslations: () => translate,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const access = vi.hoisted(() => ({ canWrite: true }))
vi.mock('@/components/access-context', () => ({ useCanWrite: () => access.canWrite }))

const translate = (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key

beforeEach(() => { access.canWrite = true })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Explore discovery UI', () => {
  it('renders transparent Trending metrics, stale state, and source evidence', async () => {
    stubPage({
      items: [{
        kind: 'trending', id: '00000000-0000-4000-8000-000000000001', label: 'AI agents',
        summary: 'Three articles from two sources.', score: 72,
        metrics: { articleCount: 3, sourceCount: 2, priorArticleCount: 1, growth: 2, freshness: 0.8, currentWindowHours: 24, baselineWindowDays: 7 },
        sources: [{ entryId: 42, title: 'Agent article', url: 'https://news.example/agent', sourceTitle: 'News', publishedAt: null }],
        generatedAt: '2026-07-25T10:00:00.000Z',
      }],
      generationId: '00000000-0000-4000-8000-000000000002', generatedAt: '2026-07-25T10:00:00.000Z',
      isStale: true, total: 1, limit: 20, offset: 0,
    })
    const user = userEvent.setup()
    render(<ExploreDiscovery kind="trending" />)

    expect(await screen.findByText('AI agents')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByRole('status').textContent).toBe('stale')
    await user.click(screen.getByRole('button', { name: /viewSources/ }))
    const source = await screen.findByRole('link', { name: /Agent article/ })
    expect(source.getAttribute('href')).toBe('https://news.example/agent')
    expect(source.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('shows evidence-backed Deal Signals and replaces create with an existing fund Deal link', async () => {
    stubPage({
      items: [{
        kind: 'deal_signal', id: '00000000-0000-4000-8000-000000000001', companyName: 'Acme', companyDomain: 'acme.example',
        stage: 'Seed', amount: '$3m', eventDate: null, confidence: 0.91,
        evidence: ['Acme is raising a seed round.'], sources: [], generatedAt: '2026-07-25T10:00:00.000Z',
        existingDealId: '00000000-0000-4000-8000-000000000003',
      }],
      generationId: '00000000-0000-4000-8000-000000000002', generatedAt: '2026-07-25T10:00:00.000Z',
      isStale: false, total: 1, limit: 20, offset: 0,
    })
    render(<ExploreDiscovery kind="deal_signal" />)

    expect(await screen.findByText('Acme')).toBeDefined()
    expect(screen.getByText('Acme is raising a seed round.')).toBeDefined()
    expect(screen.getByRole('link', { name: /openDeal/ }).getAttribute('href')).toBe('/deals/00000000-0000-4000-8000-000000000003')
    expect(screen.queryByRole('button', { name: /createDeal/ })).toBeNull()
  })

  it('does not offer Deal creation when the current user lacks dealflow write access', async () => {
    access.canWrite = false
    stubPage({
      items: [{
        kind: 'deal_signal', id: '00000000-0000-4000-8000-000000000001', companyName: 'Acme', companyDomain: null,
        stage: null, amount: null, eventDate: null, confidence: 0.9, evidence: ['Acme is raising.'], sources: [],
        generatedAt: '2026-07-25T10:00:00.000Z', existingDealId: null,
      }],
      generationId: '00000000-0000-4000-8000-000000000002', generatedAt: '2026-07-25T10:00:00.000Z',
      isStale: false, total: 1, limit: 20, offset: 0,
    })
    render(<ExploreDiscovery kind="deal_signal" />)

    expect(await screen.findByText('Acme')).toBeDefined()
    expect(screen.queryByRole('button', { name: /createDeal/ })).toBeNull()
  })

  it('ignores a stale response after switching discovery kinds', async () => {
    const requests = new Map<string, (response: unknown) => void>()
    vi.stubGlobal('fetch', vi.fn((path: string) => new Promise(resolve => {
      requests.set(new URL(path, 'https://reporting.example').searchParams.get('kind')!, resolve)
    })))
    const view = render(<ExploreDiscovery kind="trending" />)
    view.rerender(<ExploreDiscovery kind="deal_signal" />)
    await waitFor(() => expect(requests.has('deal_signal')).toBe(true))

    await act(async () => requests.get('deal_signal')?.(responseFor({
      items: [{
        kind: 'deal_signal', id: '00000000-0000-4000-8000-000000000001', companyName: 'Current signal', companyDomain: null,
        stage: null, amount: null, eventDate: null, confidence: 0.9, evidence: ['Current signal is raising.'], sources: [],
        generatedAt: '2026-07-25T10:00:00.000Z', existingDealId: null,
      }],
      generationId: '00000000-0000-4000-8000-000000000002', generatedAt: '2026-07-25T10:00:00.000Z',
      isStale: false, total: 1, limit: 20, offset: 0,
    })))
    expect(await screen.findByText('Current signal')).toBeDefined()

    await act(async () => requests.get('trending')?.(responseFor({
      items: [{
        kind: 'trending', id: '00000000-0000-4000-8000-000000000003', label: 'Stale trending response',
        summary: '', score: 50,
        metrics: { articleCount: 2, sourceCount: 2, priorArticleCount: 0, growth: 2, freshness: 1, currentWindowHours: 24, baselineWindowDays: 7 },
        sources: [], generatedAt: '2026-07-25T09:00:00.000Z',
      }],
      generationId: '00000000-0000-4000-8000-000000000004', generatedAt: '2026-07-25T09:00:00.000Z',
      isStale: false, total: 1, limit: 20, offset: 0,
    })))

    expect(screen.getByText('Current signal')).toBeDefined()
    expect(screen.queryByText('Stale trending response')).toBeNull()
  })
})

function stubPage(data: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => responseFor(data)))
}

function responseFor(data: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({ success: true, data, error: null }),
  }
}
