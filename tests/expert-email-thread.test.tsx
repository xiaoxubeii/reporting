// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { ExpertEmailThread } from '@/components/diligence/expert-email-thread'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ExpertEmailThread', () => {
  it('loads with no-store and renders plain text plus safe attachment metadata', async () => {
    let finish: ((value: unknown) => void) | undefined
    const fetchMock = vi.fn(() => new Promise(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<ExpertEmailThread dealId="deal-1" requestId="request-1" />)

    expect(screen.getByText('emailThread.loading')).toBeDefined()
    finish?.({
      ok: true,
      json: async () => ({ thread: {
        id: 'thread-1', subject: 'Expert invitation', status: 'open',
        participantAddress: 'expert@example.test', renderingPolicy: 'plain_text_only',
        createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T01:00:00.000Z',
        messages: [{
          id: 'message-1', direction: 'inbound', from: 'Expert <expert@example.test>',
          to: ['alice@cci.fundworkspace.com'], subject: 'Re: Expert invitation',
          body: { kind: 'plain_text', text: 'A safe expert reply.\n<img src=x onerror=steal()>' },
          attachments: [{ filename: 'answer.pdf', contentType: 'application/pdf', sizeBytes: 321 }],
          occurredAt: '2026-07-26T01:00:00.000Z',
        }],
      } }),
    })

    expect(await screen.findByText(/A safe expert reply/)).toBeDefined()
    expect(screen.getByText(/answer\.pdf/)).toBeDefined()
    expect(view.container.querySelector('img')).toBeNull()
    expect(view.container.innerHTML).not.toContain('dangerouslySetInnerHTML')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/diligence/deal-1/expert-validations/request-1/email-thread',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    )
  })

  it('shows an explicit empty state for an authorized thread without messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ thread: {
        id: 'thread-1', subject: null, status: 'open', participantAddress: null,
        renderingPolicy: 'plain_text_only', createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z', messages: [],
      } }),
    }))

    render(<ExpertEmailThread dealId="deal-1" requestId="request-1" />)
    expect(await screen.findByText('emailThread.empty')).toBeDefined()
  })

  it('shows a concise error state without leaking the server response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'private provider detail' }),
    }))

    render(<ExpertEmailThread dealId="deal-1" requestId="request-1" />)
    expect(await screen.findByText('emailThread.error')).toBeDefined()
    await waitFor(() => expect(screen.queryByText('private provider detail')).toBeNull())
  })

  it('recovers from a transient network failure without leaving a permanent error state', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ thread: {
          id: 'thread-1', subject: null, status: 'open', participantAddress: null,
          renderingPolicy: 'plain_text_only', createdAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T00:00:00.000Z', messages: [{
            id: 'message-1', direction: 'inbound', from: 'expert@example.test', to: [], subject: null,
            body: { kind: 'plain_text', text: 'Recovered expert reply' }, attachments: [],
            occurredAt: '2026-07-26T00:00:00.000Z',
          }],
        } }),
      })
    vi.stubGlobal('fetch', fetchMock)

    render(<ExpertEmailThread dealId="deal-1" requestId="request-1" />)
    expect(await screen.findByText('Recovered expert reply', {}, { timeout: 3_000 })).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('emailThread.error')).toBeNull()
  })
})
