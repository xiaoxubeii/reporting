// @vitest-environment jsdom

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
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
  it('never offers Fund creation or domain matching on a tenant host', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/onboarding/fund') {
        return { ok: true, json: async () => ({ state: 'unaffiliated' }) }
      }
      throw new Error(`unexpected request ${input}`)
    })

    renderTenantOnboarding(fetchMock)

    expect(await screen.findByText('Alpha Fund is invitation-only')).toBeDefined()
    expect(screen.getByText(/Email-domain matching is no longer used/)).toBeDefined()
    expect(screen.queryByLabelText('Fund name')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/onboarding/check-domain')
  })

  it('offers only the exact-invitation entry point on a tenant host', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/onboarding/fund') {
        return { ok: true, json: async () => ({ state: 'unaffiliated' }) }
      }
      throw new Error(`unexpected request ${input}`)
    })

    renderTenantOnboarding(fetchMock)

    const inviteLink = await screen.findByRole('link', { name: 'Open an invitation' })
    expect(inviteLink.getAttribute('href')).toBe('/invite')
    expect(screen.queryByRole('button', { name: /create/i })).toBeNull()
  })
})
