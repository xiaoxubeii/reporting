// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createDefaultFundPublicSiteContent } from '@/lib/fund-public-site/content'

const confirm = vi.hoisted(() => vi.fn(async () => true))
const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const names: Record<string, string> = {
      title: 'Public site',
      'templates.title': 'Choose a template',
      'templates.focus.name': 'Focus',
      'templates.institutional.name': 'Institutional',
      'templates.minimal.name': 'Minimal',
      saveDraft: 'Save draft',
      publish: 'Publish',
    }
    return names[key] ?? `${key}${values ? ` ${JSON.stringify(values)}` : ''}`
  },
}))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => confirm }))
vi.mock('@/components/tenant-branding-provider', () => ({ useTenantBranding: () => ({ name: 'Alpha Ventures', logoUrl: null, slug: 'alpha' }) }))

import { PublicSiteEditor } from '@/app/(app)/settings/public-site/public-site-editor'

const initialContent = createDefaultFundPublicSiteContent('Alpha Ventures')
const initialSite = {
  templateKey: 'focus' as const,
  content: initialContent,
  draftRevision: 4,
  lifecycleRevision: 7,
  publishedVersion: 2,
  publishedFromDraftRevision: 4,
  isPublished: true,
  publishedAt: '2026-07-26T00:00:00Z',
  hasUnpublishedChanges: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ site: initialSite, fund: { name: 'Alpha Ventures', slug: 'alpha' } }) })
})

afterEach(cleanup)

describe('Public Site Settings editor', () => {
  it('offers exactly three keyboard-selectable template cards', async () => {
    render(<PublicSiteEditor />)
    const radios = await screen.findAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /Focus/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: /Institutional/ }))
    expect(screen.getByRole('radio', { name: /Institutional/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('switches presentation without rewriting shared content when saving', async () => {
    render(<PublicSiteEditor />)
    fireEvent.click(await screen.findByRole('radio', { name: /Minimal/ }))
    fireEvent.click(screen.getByRole('button', { name: /Save draft/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const init = fetchMock.mock.calls[1][1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.templateKey).toBe('minimal')
    expect(body.content).toEqual(initialContent)
    expect(body).not.toHaveProperty('fundId')
  })

  it('uses an isolated responsive document and the selected content locale for previews', async () => {
    render(<PublicSiteEditor />)
    fireEvent.click(await screen.findByRole('button', { name: /preview/i }))
    fireEvent.click(screen.getByRole('button', { name: '简体中文' }))

    const frame = screen.getByTitle(/savedDraftPreview/i)
    expect(frame.tagName).toBe('IFRAME')
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin')
    expect(frame.getAttribute('src')).toContain('locale=zh-CN')
  })
})
