// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchPage, type SearchSourceOption } from '@/components/search/search-page'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Keep the component tests focused on Search behavior; Radix's portal and
// focus-trap mechanics are covered by the real-browser verification.
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    open ? <div data-testid="source-sheet">{children}</div> : null
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/feeds/feed-reader-sheet', () => ({
  FeedReaderSheet: ({ open, onOpenChange, loadRemoteImages }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    loadRemoteImages?: boolean
  }) => open ? (
    <div role="dialog" aria-label="feed reader" data-load-remote-images={String(loadRemoteImages)}>
      <button type="button" onClick={() => onOpenChange(false)}>close reader</button>
    </div>
  ) : null,
}))

const SOURCES: readonly SearchSourceOption[] = Object.freeze([
  Object.freeze({ id: 'feeds', label: 'Feeds', group: 'personal', available: true }),
  Object.freeze({ id: 'pubmed', label: 'PubMed', group: 'professional', available: true }),
  Object.freeze({ id: 'clinical_trials', label: 'ClinicalTrials.gov', group: 'professional', available: false, reason: 'disabled' }),
  Object.freeze({ id: 'web', label: 'Web search', group: 'web', available: true }),
])

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SearchPage', () => {
  it('uses available Feed/Web defaults, submits explicitly, and labels a partial source failure', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        error: null,
        data: {
          partial: true,
          sources: [
            { id: 'feeds', status: 'ok', resultCount: 1 },
            { id: 'web', status: 'timeout', resultCount: 0, message: 'The source timed out.' },
          ],
          results: [{
            id: 'feed-42',
            primaryOrigin: 'feed',
            origins: ['feed'],
            title: 'Aortic valve update',
            sources: [{ id: 'feeds', label: 'Feeds' }],
            feedEntryId: 42,
          }],
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SearchPage sources={SOURCES} />)

    expect((screen.getByLabelText('Feeds') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Web search') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('PubMed') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: /ClinicalTrials\.gov/ }) as HTMLInputElement).disabled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('queryLabel'), 'heart valve')
    await user.click(screen.getByRole('button', { name: 'submit' }))

    expect(await screen.findByText('Aortic valve update')).toBeDefined()
    expect(screen.getByText('Web search:')).toBeDefined()
    expect(screen.getByText('The source timed out.')).toBeDefined()
    expect(screen.getAllByText('sourceStatus.ok').length).toBeGreaterThan(0)
    expect(screen.getAllByText('sourceStatus.timeout').length).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledWith('/api/search', expect.objectContaining({ method: 'POST' }))
  })

  it('keeps mobile filter edits as a draft until Apply and discards them on Cancel', async () => {
    const user = userEvent.setup()
    render(<SearchPage sources={SOURCES} />)

    await user.click(screen.getByRole('button', { name: 'sources' }))
    const firstDraft = screen.getAllByLabelText('PubMed').at(-1) as HTMLInputElement
    await user.click(firstDraft)
    await user.click(screen.getByRole('button', { name: 'cancelFilters' }))
    expect((screen.getByLabelText('PubMed') as HTMLInputElement).checked).toBe(false)

    await user.click(screen.getByRole('button', { name: 'sources' }))
    const secondDraft = screen.getAllByLabelText('PubMed').at(-1) as HTMLInputElement
    expect(secondDraft.checked).toBe(false)
    await user.click(secondDraft)
    await user.click(screen.getByRole('button', { name: 'applyFilters' }))
    expect((screen.getByLabelText('PubMed') as HTMLInputElement).checked).toBe(true)
  })

  it('opens the Feed reader in place and restores focus to the result action on close', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        error: null,
        data: {
          partial: false,
          sources: [{ id: 'feeds', status: 'ok', resultCount: 1 }],
          results: [{
            id: 'feed-7',
            primaryOrigin: 'feed',
            origins: ['feed'],
            title: 'Feed result',
            sources: [{ id: 'feeds', label: 'Feeds' }],
            feedEntryId: 7,
          }],
        },
      }),
    })))
    const user = userEvent.setup()
    render(<SearchPage sources={SOURCES} />)
    await user.type(screen.getByLabelText('queryLabel'), 'device')
    await user.click(screen.getByRole('button', { name: 'submit' }))

    const readerButton = await screen.findByRole('button', { name: 'reader' })
    await user.click(readerButton)
    expect(screen.getByRole('dialog', { name: 'feed reader' }).getAttribute('data-load-remote-images')).toBe('false')
    await user.click(screen.getByRole('button', { name: 'close reader' }))
    await waitFor(() => expect(document.activeElement).toBe(readerButton))
  })
})
