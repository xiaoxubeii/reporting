// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExpertDirectory } from '@/components/experts/expert-directory'
import type { ExpertCandidate } from '@/lib/expert-discovery/types'
import type { ExpertDirectoryEntry } from '@/lib/expert-validation/types'
import englishMessages from '@/messages/en.json'
import chineseMessages from '@/messages/zh-CN.json'

vi.mock('@/components/analyst-context-actions', () => ({ AnalystContextActions: () => null }))
vi.mock('@/lib/analyst/source-snapshots', () => ({ snapshotExpert: vi.fn(() => ({})) }))

const experts: ExpertDirectoryEntry[] = [
  {
    id: 'platform-1', scope: 'global', name: 'Alice Heart', title: 'Cardiologist',
    organization: 'General Hospital', profileText: 'Heart failure specialist', status: 'active',
    hasEmbedding: true, verificationType: 'platform_certified', sourceType: 'platform', verifiedAt: null,
  },
  {
    id: 'fund-1', scope: 'fund', name: 'Bob Neuro', title: 'Professor',
    organization: 'Brain Institute', profileText: 'Neuroscience researcher', status: 'active',
    hasEmbedding: true, verificationType: 'fund_confirmed', sourceType: 'manual', verifiedAt: null,
  },
]

const candidates: ExpertCandidate[] = [
  {
    id: 'candidate-pending', name: 'Pending Person', email: null, title: 'Investigator',
    organization: 'Clinic A', profileText: 'Pending profile', status: 'pending',
    discoveryQuery: 'cardiology', evidence: [], confirmedExpertId: null,
    createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
  },
  {
    id: 'candidate-confirmed', name: 'Confirmed Person', email: 'confirmed@example.invalid', title: 'PI',
    organization: 'Clinic B', profileText: 'Confirmed profile', status: 'confirmed',
    discoveryQuery: 'cardiology', evidence: [], confirmedExpertId: 'expert-2',
    createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
  },
  {
    id: 'candidate-rejected', name: 'Rejected Person', email: null, title: 'Researcher',
    organization: 'Clinic C', profileText: 'Rejected profile', status: 'rejected',
    discoveryQuery: 'cardiology', evidence: [], confirmedExpertId: null,
    createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
  },
]

function renderDirectory(
  locale: 'en' | 'zh-CN' = 'en',
  fixtures: { experts?: ExpertDirectoryEntry[]; candidates?: ExpertCandidate[] } = {},
) {
  const messages = locale === 'en' ? englishMessages : chineseMessages
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <ExpertDirectory
        initialExperts={fixtures.experts ?? experts}
        initialCandidates={fixtures.candidates ?? candidates}
        isAdmin
      />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Expert Directory search toolbar', () => {
  it('filters both directory tabs live and distinguishes search from general empty states', async () => {
    const user = userEvent.setup()
    renderDirectory()

    expect(screen.getByText('Alice Heart')).toBeTruthy()
    expect(screen.getByText('1 expert')).toBeTruthy()
    await user.type(screen.getByRole('textbox', { name: 'Search experts' }), 'missing')
    expect(screen.getByText('No experts match this search.')).toBeTruthy()
    expect(screen.getByText('0 experts')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Fund Experts' }))
    expect(screen.getByText('No experts match this search.')).toBeTruthy()
    await user.clear(screen.getByRole('textbox', { name: 'Search experts' }))
    expect(screen.getByText('Bob Neuro')).toBeTruthy()
    expect(screen.getByText('1 expert')).toBeTruthy()
  })

  it('preserves the distinct platform and fund empty states for empty directories', async () => {
    const user = userEvent.setup()
    renderDirectory('en', { experts: [] })

    expect(screen.getByText('No active platform-certified experts are available.')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Fund Experts' }))
    expect(screen.getByText(/No fund experts yet/)).toBeTruthy()
  })

  it('keeps source choices independent and sends the selected sources in the existing payload', async () => {
    const user = userEvent.setup()
    let resolveSearch!: (response: { ok: boolean; json: () => Promise<unknown> }) => void
    const fetchMock = vi.fn().mockReturnValue(new Promise(resolve => { resolveSearch = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    renderDirectory()
    await user.click(screen.getByRole('tab', { name: 'Discover Candidates' }))

    const discoverButton = screen.getByRole('button', { name: 'Discover experts' })
    expect((discoverButton as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByRole('textbox', { name: 'Discovery query' }), ' cardiology ')
    expect((discoverButton as HTMLButtonElement).disabled).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Professional sources' }))
    const sourceMenu = screen.getByRole('dialog', { name: 'Professional sources' })
    const pubmed = within(sourceMenu).getByRole('checkbox', { name: 'PubMed' })
    const trials = within(sourceMenu).getByRole('checkbox', { name: 'ClinicalTrials.gov' })
    expect((pubmed as HTMLInputElement).checked).toBe(true)
    expect((trials as HTMLInputElement).checked).toBe(true)
    await user.click(trials)
    expect((pubmed as HTMLInputElement).checked).toBe(true)
    expect((trials as HTMLInputElement).checked).toBe(false)

    await user.click(discoverButton)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect((discoverButton as HTMLButtonElement).disabled).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/experts/discovery/search', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ query: 'cardiology', sourceIds: ['pubmed'] }),
    }))
    resolveSearch({ ok: true, json: async () => ({ candidates, sources: [] }) })
    await waitFor(() => expect((discoverButton as HTMLButtonElement).disabled).toBe(false))
  })

  it('filters all candidate statuses and exposes named Radix controls', async () => {
    const user = userEvent.setup()
    renderDirectory()
    await user.click(screen.getByRole('tab', { name: 'Discover Candidates' }))

    const status = screen.getByRole('combobox', { name: 'Status' })
    expect(screen.getByText('1 candidate')).toBeTruthy()
    expect(screen.getByText('Pending Person')).toBeTruthy()
    expect(screen.queryByText('Confirmed Person')).toBeNull()

    await user.click(status)
    await user.click(screen.getByRole('option', { name: 'Confirmed' }))
    expect(screen.getByText('Confirmed Person')).toBeTruthy()
    expect(screen.queryByText('Pending Person')).toBeNull()

    await user.click(status)
    await user.click(screen.getByRole('option', { name: 'All statuses' }))
    expect(screen.getByText('3 candidates')).toBeTruthy()
    expect(screen.getByText('Pending Person')).toBeTruthy()
    expect(screen.getByText('Confirmed Person')).toBeTruthy()

    await user.click(status)
    await user.click(screen.getByRole('option', { name: 'Rejected' }))
    expect(screen.getByText('1 candidate')).toBeTruthy()
    expect(screen.getByText('Rejected Person')).toBeTruthy()
    expect(screen.queryByText('Pending Person')).toBeNull()
    expect(screen.queryByText('Confirmed Person')).toBeNull()
  })

  it('renders matching localized labels and plural counts', () => {
    renderDirectory('zh-CN')
    expect(screen.getByRole('textbox', { name: '搜索专家' })).toBeTruthy()
    expect(screen.getByText('1 位专家')).toBeTruthy()
  })

  it('uses a full-width mobile search row before the count', () => {
    renderDirectory()
    const input = screen.getByRole('textbox', { name: 'Search experts' })
    expect(input.parentElement?.className).toContain('w-full')
    expect(input.parentElement?.className).toContain('sm:max-w-md')
    expect(input.parentElement?.parentElement?.className).toContain('flex-col')
    fireEvent.change(input, { target: { value: 'Alice' } })
    expect(screen.getByText('1 expert')).toBeTruthy()
  })
})
