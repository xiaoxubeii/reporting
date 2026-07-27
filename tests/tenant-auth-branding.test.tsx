// @vitest-environment jsdom

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthWordmark } from '@/components/auth-shell'
import { TenantBrandingProvider } from '@/components/tenant-branding-provider'
import { PortalChrome } from '@/components/portal-chrome'
import englishMessages from '@/messages/en.json'

vi.mock('next/navigation', () => ({ usePathname: () => '/portal/welcome' }))

beforeEach(() => vi.stubGlobal('React', React))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('tenant authentication branding', () => {
  it('uses the request-scoped Host Fund name and logo over page defaults', () => {
    render(
      <NextIntlClientProvider locale="en" messages={englishMessages}>
        <TenantBrandingProvider value={{
          slug: 'alpha-fund',
          name: 'Alpha Fund',
          logoUrl: 'https://assets.example.test/alpha.png',
        }}>
          <AuthWordmark logoSrc="/default.png" label="Default Product" />
        </TenantBrandingProvider>
      </NextIntlClientProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Alpha Fund' })).toBeDefined()
    expect(screen.getByRole('presentation').getAttribute('src')).toBe('https://assets.example.test/alpha.png')
    expect(screen.queryByText('Default Product')).toBeNull()
  })

  it('keeps Fund branding visible during LP welcome without showing portal navigation', () => {
    render(
      <NextIntlClientProvider locale="en" messages={englishMessages}>
        <PortalChrome
          fundName="Alpha Fund"
          logoUrl="https://assets.example.test/alpha.png"
          userEmail=""
        >
          <div>LP setup</div>
        </PortalChrome>
      </NextIntlClientProvider>,
    )

    expect(screen.getByText('Alpha Fund')).toBeDefined()
    expect(screen.getByRole('presentation').getAttribute('src')).toBe('https://assets.example.test/alpha.png')
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull()
  })
})
