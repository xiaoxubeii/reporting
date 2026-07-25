// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchCategorySettings } from '@/components/settings/search-category-settings'

const { translate } = vi.hoisted(() => ({
  translate: (key: string) => key,
}))

vi.mock('next-intl', () => ({ useTranslations: () => translate }))

const CONFIG = {
  version: 1 as const,
  categories: [{
    id: 'internet',
    label: { en: 'Internet', 'zh-CN': '互联网' },
    description: { en: 'Public web', 'zh-CN': '公开互联网' },
    enabled: true,
    defaultSelected: true,
    adapterIds: ['web'],
  }],
}
const ADAPTERS = [{
  id: 'web', label: 'Internet', origin: 'web', adapterType: 'metasearch', liveTransportAvailable: true, resultLimit: 10,
}, {
  id: 'pubmed', label: 'PubMed', origin: 'specialized', adapterType: 'api', liveTransportAvailable: true, resultLimit: 5,
}]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SearchCategorySettings', () => {
  it('loads fund configuration and atomically saves an immutable edited catalog', async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => ({
      ok: true,
      json: async () => init?.method === 'PUT'
        ? { config: JSON.parse(String(init.body)) }
        : { config: CONFIG, adapters: ADAPTERS },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SearchCategorySettings />)

    const englishLabel = await screen.findByDisplayValue('Internet')
    await user.clear(englishLabel)
    await user.type(englishLabel, 'Open web')
    await user.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1]
    expect(JSON.parse(String(init?.body))).toMatchObject({
      version: 1,
      categories: [{ id: 'internet', label: { en: 'Open web', 'zh-CN': '互联网' }, adapterIds: ['web'] }],
    })
    expect(screen.getByRole('status').textContent).toBe('saved')
  })

  it('shows retired adapter mappings and lets an admin remove them before saving', async () => {
    const orphanedConfig = {
      ...CONFIG,
      categories: [{ ...CONFIG.categories[0], adapterIds: ['retired_adapter', 'web'] }],
    }
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => ({
      ok: true,
      json: async () => init?.method === 'PUT'
        ? { config: JSON.parse(String(init.body)) }
        : { config: orphanedConfig, adapters: ADAPTERS },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<SearchCategorySettings />)

    const orphaned = await screen.findByRole('checkbox', { name: 'unavailableAdapter (retired_adapter)' })
    expect((orphaned as HTMLInputElement).checked).toBe(true)
    await user.click(orphaned)
    await user.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1]
    expect(JSON.parse(String(init?.body)).categories[0].adapterIds).toEqual(['web'])
  })

  it('supports reorder, add, remove, bilingual details, state controls, and registered adapter mappings', async () => {
    const multiCategoryConfig = {
      ...CONFIG,
      categories: [
        CONFIG.categories[0],
        {
          id: 'research',
          label: { en: 'Research', 'zh-CN': '研究' },
          description: { en: 'Literature', 'zh-CN': '文献' },
          enabled: true,
          defaultSelected: false,
          adapterIds: ['pubmed'],
        },
      ],
    }
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => ({
      ok: true,
      json: async () => init?.method === 'PUT'
        ? { config: JSON.parse(String(init.body)) }
        : { config: multiCategoryConfig, adapters: ADAPTERS },
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('crypto', { randomUUID: () => '12345678-1234-1234-1234-123456789abc' })
    const user = userEvent.setup()
    render(<SearchCategorySettings />)

    const researchCode = await screen.findByText('research')
    const researchCard = researchCode.closest('.rounded-md') as HTMLElement
    await user.click(within(researchCard).getByRole('button', { name: 'moveUp' }))
    const englishDescription = within(researchCard).getByDisplayValue('Literature')
    await user.clear(englishDescription)
    await user.type(englishDescription, 'Reviewed literature')
    await user.click(within(researchCard).getByRole('switch', { name: 'enabled' }))
    await user.click(within(researchCard).getByRole('switch', { name: 'defaultSelected' }))
    await user.click(within(researchCard).getByRole('checkbox', { name: 'Internet' }))
    await user.click(screen.getByRole('button', { name: 'add' }))

    const internetCard = screen.getByText('internet').closest('.rounded-md') as HTMLElement
    await user.click(within(internetCard).getByRole('button', { name: 'remove' }))
    await user.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1]
    const saved = JSON.parse(String(init?.body))
    expect(saved.categories).toHaveLength(2)
    expect(saved.categories[0]).toMatchObject({
      id: 'research',
      description: { en: 'Reviewed literature', 'zh-CN': '文献' },
      enabled: false,
      defaultSelected: true,
      adapterIds: ['pubmed', 'web'],
    })
    expect(saved.categories[1].id).toBe('custom-123456781234')
  })
})
