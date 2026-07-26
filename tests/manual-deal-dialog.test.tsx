// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ManualDealDialog } from '@/components/deals/manual-deal-dialog'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ManualDealDialog', () => {
  it('prefills bounded source context, keeps founder confirmation required, and posts the existing multipart contract', async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      void input
      void init
      return { ok: true, json: async () => ({ deal_id: 'deal-1' }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<ManualDealDialog open onOpenChange={vi.fn()} onCreated={onCreated} prefill={{ key: 'signal-1', companyName: 'Acme', companyUrl: 'acme.example', pitch: 'Source link: https://news.example/acme' }} />)

    expect(screen.getByDisplayValue('Acme')).toBeDefined()
    expect(screen.getByDisplayValue('https://acme.example/')).toBeDefined()
    const create = screen.getByRole('button', { name: 'create' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    await user.type(screen.getByLabelText('founderName *'), 'Ada Founder')
    await user.type(screen.getByLabelText('founderEmail *'), 'ada@acme.example')
    expect(create.disabled).toBe(false)
    await user.click(create)

    expect(fetchMock).toHaveBeenCalledWith('/api/deals/manual', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }))
    const form = fetchMock.mock.calls[0][1]?.body as FormData
    expect(form.get('company_name')).toBe('Acme')
    expect(form.get('founder_name')).toBe('Ada Founder')
    expect(form.get('pitch')).toContain('Source link:')
    expect(onCreated).toHaveBeenCalledWith('deal-1')
  })
})
