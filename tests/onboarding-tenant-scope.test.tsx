// @vitest-environment jsdom

import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OnboardingPage from '@/app/onboarding/page'
import { TenantBrandingProvider } from '@/components/tenant-branding-provider'
import englishMessages from '@/messages/en.json'

const push = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  vi.stubGlobal('React', React)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function renderTenantOnboarding(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  render(
    <NextIntlClientProvider locale="en" messages={englishMessages}>
      <TenantBrandingProvider value={{ slug: 'alpha-fund', name: 'Alpha Fund', logoUrl: null }}>
        <OnboardingPage />
      </TenantBrandingProvider>
    </NextIntlClientProvider>,
  )
}

describe('tenant-hosted onboarding', () => {
  it('never offers Fund creation when the signed-in email cannot join the Host Fund', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/onboarding/fund') {
        return { ok: true, json: async () => ({ step: 1, fundId: null, webhookToken: null }) }
      }
      if (input === '/api/onboarding/check-domain') {
        return { ok: true, json: async () => ({ fund: null }) }
      }
      throw new Error(`unexpected request ${input}`)
    })

    renderTenantOnboarding(fetchMock)

    expect(await screen.findByRole('heading', { name: 'Alpha Fund workspace' })).toBeDefined()
    expect(screen.getByText('Your account cannot join this workspace.')).toBeDefined()
    expect(screen.queryByLabelText('Fund name')).toBeNull()
  })

  it('shows only the matching Host Fund join action without a create alternative', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/onboarding/fund') {
        return { ok: true, json: async () => ({ step: 1, fundId: null, webhookToken: null }) }
      }
      if (input === '/api/onboarding/check-domain') {
        return {
          ok: true,
          json: async () => ({ fund: { id: '82000000-0000-4000-8000-000000000001', name: 'Alpha Fund' } }),
        }
      }
      throw new Error(`unexpected request ${input}`)
    })

    renderTenantOnboarding(fetchMock)

    expect(await screen.findByRole('button', { name: 'Request to join' })).toBeDefined()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Create a new fund instead' })).toBeNull())
  })
})
