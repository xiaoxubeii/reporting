// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchPage } from '@/components/search/search-page'
import type { SearchCategoryOption } from '@/lib/search/categories'

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

const CATEGORIES: readonly SearchCategoryOption[] = Object.freeze([
  Object.freeze({ id: 'subscriptions', label: 'Feeds', description: 'Personal subscriptions', defaultSelected: true, available: true }),
  Object.freeze({ id: 'research', label: 'Medical research', description: 'PubMed and trials', defaultSelected: false, available: true }),
  Object.freeze({ id: 'industry', label: 'Industry websites', description: '', defaultSelected: false, available: false, reason: 'disabled' }),
  Object.freeze({ id: 'internet', label: 'Web search', description: 'Public web', defaultSelected: true, available: true }),
])

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SearchPage', () => {
  it('uses the standard top-level page title size', () => {
    render(<SearchPage categories={CATEGORIES} />)

    expect(screen.getByRole('heading', { level: 1, name: 'title' }).classList.contains('text-2xl')).toBe(true)
  })

  it('shows an explicit unavailable state when category configuration cannot be loaded', () => {
    render(<SearchPage categories={[]} configurationUnavailable />)

    expect(screen.getByRole('alert').textContent).toBe('errors.configurationUnavailable')
    expect((screen.getByRole('button', { name: 'submit' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('uses available Feed/Web defaults, submits explicitly, and labels a partial source failure', async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      void input
      void init
      return {
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
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SearchPage categories={CATEGORIES} />)

    expect((screen.getByLabelText('Feeds') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Web search') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Medical research') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: /Industry websites/ }) as HTMLInputElement).disabled).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('queryLabel'), 'heart valve')
    await user.click(screen.getByRole('button', { name: 'submit' }))

    expect(await screen.findByText('Aortic valve update')).toBeDefined()
    expect(screen.getByText('Internet:')).toBeDefined()
    expect(screen.getByText('The source timed out.')).toBeDefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/search', expect.objectContaining({ method: 'POST' }))
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'heart valve',
      categoryIds: ['subscriptions', 'internet'],
    })
  })

  it('does not show a warning when the logical Web source succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        error: null,
        data: {
          partial: false,
          sources: [
            { id: 'feeds', status: 'empty', resultCount: 0 },
            { id: 'web', status: 'ok', resultCount: 1 },
          ],
          results: [{
            id: 'web-1',
            primaryOrigin: 'web',
            origins: ['web'],
            title: 'Web result',
            sources: [{ id: 'web', label: 'Web' }],
            url: 'https://example.com/result',
          }],
        },
      }),
    })))
    const user = userEvent.setup()
    render(<SearchPage categories={CATEGORIES} />)

    await user.type(screen.getByLabelText('queryLabel'), 'device')
    await user.click(screen.getByRole('button', { name: 'submit' }))

    expect(await screen.findByText('Web result')).toBeDefined()
    expect(screen.queryByText('partial')).toBeNull()
    expect(screen.queryByText('Internet:')).toBeNull()
  })

  it('keeps mobile filter edits as a draft until Apply and discards them on Cancel', async () => {
    const user = userEvent.setup()
    render(<SearchPage categories={CATEGORIES} />)

    await user.click(screen.getByRole('button', { name: 'sources' }))
    const firstDraft = screen.getAllByLabelText('Medical research').at(-1) as HTMLInputElement
    await user.click(firstDraft)
    await user.click(screen.getByRole('button', { name: 'cancelFilters' }))
    expect((screen.getByLabelText('Medical research') as HTMLInputElement).checked).toBe(false)

    await user.click(screen.getByRole('button', { name: 'sources' }))
    const secondDraft = screen.getAllByLabelText('Medical research').at(-1) as HTMLInputElement
    expect(secondDraft.checked).toBe(false)
    await user.click(secondDraft)
    await user.click(screen.getByRole('button', { name: 'applyFilters' }))
    expect((screen.getByLabelText('Medical research') as HTMLInputElement).checked).toBe(true)
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
    render(<SearchPage categories={CATEGORIES} />)
    await user.type(screen.getByLabelText('queryLabel'), 'device')
    await user.click(screen.getByRole('button', { name: 'submit' }))

    const readerButton = await screen.findByRole('button', { name: 'reader' })
    await user.click(readerButton)
    expect(screen.getByRole('dialog', { name: 'feed reader' }).getAttribute('data-load-remote-images')).toBe('false')
    await user.click(screen.getByRole('button', { name: 'close reader' }))
    await waitFor(() => expect(document.activeElement).toBe(readerButton))
  })
})
