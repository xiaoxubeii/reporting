// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requestState = vi.hoisted(() => ({
  acceptLanguage: 'en-US',
  cookieValue: undefined as string | undefined,
}))

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: () => requestState.cookieValue === undefined
      ? undefined
      : { value: requestState.cookieValue },
  }),
  headers: () => ({ get: () => requestState.acceptLanguage }),
}))

vi.mock('next-intl/server', () => ({
  getRequestConfig: (factory: () => unknown) => factory,
}))

import { useFormatter } from 'next-intl'
import requestConfig from '@/i18n/request'
import { I18nClientProvider } from '@/i18n/client-provider'
import { serializeTimeZoneCookie } from '@/i18n/time-zone'

function BoundaryDate() {
  const format = useFormatter()
  return (
    <span>
      {format.dateTime(new Date('2026-07-25T18:00:00.000Z'), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })}
    </span>
  )
}

beforeEach(() => {
  vi.stubGlobal('React', React)
})

afterEach(() => {
  cleanup()
  requestState.acceptLanguage = 'en-US'
  requestState.cookieValue = undefined
  vi.unstubAllGlobals()
})

describe('deterministic timezone provider', () => {
  it('resolves the request cookie into the next-intl request timezone', async () => {
    requestState.cookieValue = serializeTimeZoneCookie('manual', 'Asia/Shanghai')

    await expect(requestConfig({ requestLocale: Promise.resolve(undefined) })).resolves.toMatchObject({
      locale: 'en',
      timeZone: 'Asia/Shanghai',
    })
  })

  it('falls back to UTC in the request config when the cookie is absent', async () => {
    await expect(requestConfig({ requestLocale: Promise.resolve(undefined) })).resolves.toMatchObject({
      locale: 'en',
      timeZone: 'UTC',
    })
  })

  it('keeps the first client render in the explicit server timezone', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))

    render(
      <I18nClientProvider
        locale="en"
        messages={{}}
        timeZone="UTC"
        timeZoneSource="fallback"
      >
        <BoundaryDate />
      </I18nClientProvider>,
    )

    expect(screen.getByText('07/25/2026')).toBeTruthy()
  })

  it('formats the same boundary instant in the propagated non-UTC timezone', () => {
    render(
      <I18nClientProvider
        locale="en"
        messages={{}}
        timeZone="Asia/Shanghai"
        timeZoneSource="manual"
      >
        <BoundaryDate />
      </I18nClientProvider>,
    )

    expect(screen.getByText('07/26/2026')).toBeTruthy()
  })
})
