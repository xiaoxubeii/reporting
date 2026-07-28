// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { IdentityOnboardingError } from '@/lib/identity/errors'
import englishMessages from '@/messages/en.json'
import chineseMessages from '@/messages/zh-CN.json'

const getUser = vi.hoisted(() => vi.fn())
const loadPersonalProfile = vi.hoisted(() => vi.fn())
const savePersonalProfile = vi.hoisted(() => vi.fn())
const savePersonalTimeZone = vi.hoisted(() => vi.fn())
const setCurrentUserMailbox = vi.hoisted(() => vi.fn())
const getTrustedRequestTenant = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/identity/profile', () => ({
  loadPersonalProfile,
  savePersonalProfile,
  savePersonalTimeZone,
}))
vi.mock('@/lib/email/mailboxes', () => ({ setCurrentUserMailbox }))
vi.mock('@/lib/tenancy/request', () => ({ getTrustedRequestTenant }))
vi.mock('@/lib/email/domain', () => ({ deriveFundEmailDomain: () => 'alpha.mail.example.test' }))
vi.mock('next/headers', () => ({ headers: () => new Headers() }))

import { GET, PATCH } from '@/app/api/settings/personal/route'
import {
  TimeZonePreference,
  type TimeZonePreferenceDependencies,
} from '@/components/settings/time-zone-preference'

function personalRequest(body: unknown) {
  return new NextRequest('http://localhost/api/settings/personal', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function response(body: object, ok = true): Response {
  return { json: vi.fn().mockResolvedValue(body), ok } as unknown as Response
}

function dependencies(responses: Response[]): TimeZonePreferenceDependencies & {
  fetch: ReturnType<typeof vi.fn>
  reload: ReturnType<typeof vi.fn>
} {
  return {
    detectTimeZone: vi.fn(() => 'Asia/Shanghai'),
    fetch: vi.fn(async () => {
      const next = responses.shift()
      if (!next) throw new Error('Unexpected request')
      return next
    }),
    reload: vi.fn(),
    supportedTimeZones: () => ['America/New_York', 'Asia/Shanghai'],
  }
}

function renderPreference(
  locale: 'en' | 'zh-CN',
  timeZone: string | null,
  deps = dependencies([]),
) {
  const messages = locale === 'en' ? englishMessages : chineseMessages
  render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <TimeZonePreference timeZone={timeZone} dependencies={deps} />
    </NextIntlClientProvider>,
  )
  return deps
}

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.test' } } })
  loadPersonalProfile.mockResolvedValue({ fullName: 'Example User', timeZone: 'Asia/Shanghai' })
  savePersonalProfile.mockResolvedValue({ fullName: 'Example User' })
  setCurrentUserMailbox.mockResolvedValue({
    localPart: 'example',
    displayName: 'Example User',
    active: true,
  })
  getTrustedRequestTenant.mockResolvedValue(null)
  savePersonalTimeZone.mockImplementation(async (_admin, input: { timeZone: unknown }) => {
    if (input.timeZone !== null && input.timeZone !== 'Asia/Shanghai') {
      throw new IdentityOnboardingError('invalid_profile', 'Select a valid time zone.', 400)
    }
    return { timeZone: input.timeZone }
  })
  createAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
    })),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('personal settings timezone API', () => {
  it('includes the nullable timezone in the existing personal profile response', async () => {
    const result = await GET()

    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toMatchObject({
      profile: { fullName: 'Example User', timeZone: 'Asia/Shanghai' },
    })
  })

  it.each([
    ['manual', 'Asia/Shanghai'],
    ['Automatic', null],
  ])('persists the exact %s timezone mutation without changing name or mailbox state', async (_label, timeZone) => {
    const result = await PATCH(personalRequest({ timeZone }))

    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toEqual({ profile: { timeZone } })
    expect(savePersonalTimeZone).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      timeZone,
    })
    expect(savePersonalProfile).not.toHaveBeenCalled()
  })

  it('preserves the successful fullName mutation through exact PATCH dispatch', async () => {
    const result = await PATCH(personalRequest({ fullName: 'Example User' }))

    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toEqual({ profile: { fullName: 'Example User' } })
    expect(savePersonalProfile).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      fullName: 'Example User',
    })
    expect(savePersonalTimeZone).not.toHaveBeenCalled()
    expect(setCurrentUserMailbox).not.toHaveBeenCalled()
  })

  it('preserves the successful mailboxLocalPart mutation through exact PATCH dispatch', async () => {
    const admin = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => table === 'fund_members'
            ? { maybeSingle: vi.fn().mockResolvedValue({ data: { fund_id: 'fund-1' }, error: null }) }
            : { single: vi.fn().mockResolvedValue({ data: { email_subdomain: 'alpha' }, error: null }) }),
        })),
      })),
    }
    createAdminClient.mockReturnValue(admin)

    const result = await PATCH(personalRequest({ mailboxLocalPart: 'example' }))

    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toEqual({
      mailbox: {
        localPart: 'example',
        address: 'example@alpha.mail.example.test',
        displayName: 'Example User',
        active: true,
      },
    })
    expect(setCurrentUserMailbox).toHaveBeenCalledWith(admin, {
      fundId: 'fund-1',
      userId: 'user-1',
      localPart: 'example',
      displayName: 'Example User',
    })
    expect(savePersonalProfile).not.toHaveBeenCalled()
    expect(savePersonalTimeZone).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { timeZone: 'Asia/Shanghai', fullName: 'Changed too' },
    { timeZone: null, mailboxLocalPart: 'changed-too' },
    { timeZone: 'Asia/Shanghai', extra: true },
  ])('rejects non-exclusive timezone mutation shape %j', async body => {
    const result = await PATCH(personalRequest(body))

    expect(result.status).toBe(400)
    expect(savePersonalTimeZone).not.toHaveBeenCalled()
    expect(savePersonalProfile).not.toHaveBeenCalled()
  })

  it('rejects an invalid manual timezone without changing another personal setting', async () => {
    const result = await PATCH(personalRequest({ timeZone: 'Not/A_Zone' }))

    expect(result.status).toBe(400)
    await expect(result.json()).resolves.toMatchObject({ code: 'invalid_profile' })
    expect(savePersonalProfile).not.toHaveBeenCalled()
  })
})

describe('personal timezone preference control', () => {
  it.each([
    ['en' as const, 'Automatic', 'Manual time zone', 'Save time zone'],
    ['zh-CN' as const, '自动', '手动时区', '保存时区'],
  ])('renders localized labeled Automatic/manual states in %s', (locale, automatic, manual, save) => {
    renderPreference(locale, null)

    expect((screen.getByRole('radio', { name: automatic }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: manual }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('combobox', { name: manual }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: save }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the current manual value and supplies supported plus fallback datalist choices', () => {
    renderPreference('en', 'Europe/London')

    expect((screen.getByRole('radio', { name: 'Manual time zone' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('combobox', { name: 'Manual time zone' }) as HTMLInputElement).value).toBe('Europe/London')
    const options = Array.from(document.querySelectorAll('datalist option'), node => node.getAttribute('value'))
    expect(options).toEqual(expect.arrayContaining([
      'UTC',
      'Europe/London',
      'Asia/Shanghai',
      'America/New_York',
    ]))
  })

  it('submits a manual IANA value with Enter, then synchronizes the cookie before reloading', async () => {
    const deps = dependencies([
      response({ profile: { timeZone: 'Asia/Shanghai' } }),
      response({ mode: 'manual', timeZone: 'Asia/Shanghai', changed: true }),
    ])
    const user = userEvent.setup()
    renderPreference('en', null, deps)

    await user.click(screen.getByRole('radio', { name: 'Manual time zone' }))
    await user.type(screen.getByRole('combobox', { name: 'Manual time zone' }), 'Asia/Shanghai{Enter}')

    await waitFor(() => expect(deps.reload).toHaveBeenCalledTimes(1))
    expect(deps.fetch.mock.calls).toEqual([
      ['/api/settings/personal', expect.objectContaining({
        body: JSON.stringify({ timeZone: 'Asia/Shanghai' }),
        method: 'PATCH',
      })],
      ['/api/time-zone', expect.objectContaining({
        body: JSON.stringify({ mode: 'manual', timeZone: 'Asia/Shanghai' }),
        method: 'POST',
      })],
    ])
  })

  it('resets to Automatic with the detected zone and reloads only after both writes succeed', async () => {
    const deps = dependencies([
      response({ profile: { timeZone: null } }),
      response({ mode: 'auto', timeZone: 'Asia/Shanghai', changed: true }),
    ])
    const user = userEvent.setup()
    renderPreference('en', 'UTC', deps)

    await user.click(screen.getByRole('radio', { name: 'Automatic' }))
    fireEvent.submit(screen.getByRole('button', { name: 'Save time zone' }).closest('form')!)

    await waitFor(() => expect(deps.reload).toHaveBeenCalledTimes(1))
    expect(deps.fetch).toHaveBeenNthCalledWith(1, '/api/settings/personal', expect.objectContaining({
      body: JSON.stringify({ timeZone: null }),
    }))
    expect(deps.fetch).toHaveBeenNthCalledWith(2, '/api/time-zone', expect.objectContaining({
      body: JSON.stringify({ mode: 'auto', timeZone: 'Asia/Shanghai' }),
    }))
  })

  it.each([0, 1])('shows localized error feedback and does not reload when write %i fails', async failingIndex => {
    const responses = [
      response(failingIndex === 0 ? { error: 'Profile unavailable' } : { profile: { timeZone: 'UTC' } }, failingIndex !== 0),
      response({ error: 'Cookie unavailable' }, false),
    ]
    const deps = dependencies(responses)
    const user = userEvent.setup()
    renderPreference('en', 'UTC', deps)

    await user.click(screen.getByRole('button', { name: 'Save time zone' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to save the time zone.')
    expect(deps.fetch).toHaveBeenCalledTimes(failingIndex === 0 ? 1 : 2)
    expect(deps.reload).not.toHaveBeenCalled()
  })
})
