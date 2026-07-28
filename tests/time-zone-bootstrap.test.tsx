// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import React, { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  TimeZoneBootstrap,
  synchronizeTimeZone,
  type TimeZoneBootstrapDependencies,
} from '@/components/time-zone-bootstrap'

function jsonResponse(body: object, ok = true): Response {
  return {
    json: vi.fn().mockResolvedValue(body),
    ok,
  } as unknown as Response
}

function dependencies(
  responses: Response[],
  detectedTimeZone = 'Asia/Shanghai',
): TimeZoneBootstrapDependencies & {
  fetch: ReturnType<typeof vi.fn>
  reload: ReturnType<typeof vi.fn>
} {
  return {
    detectTimeZone: vi.fn(() => detectedTimeZone),
    fetch: vi.fn().mockImplementation(async () => {
      const response = responses.shift()
      if (!response) throw new Error('Unexpected request')
      return response
    }),
    reload: vi.fn(),
  }
}

describe('timezone bootstrap', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders no markup and performs no browser detection during SSR', () => {
    expect(renderToString(
      <TimeZoneBootstrap timeZone="UTC" timeZoneSource="fallback" />,
    )).toBe('')
  })

  it('does not write or reload when automatic detection already matches', async () => {
    const deps = dependencies([jsonResponse({ authenticated: true, manualTimeZone: null })])

    await synchronizeTimeZone(
      { timeZone: 'Asia/Shanghai', timeZoneSource: 'auto' },
      deps,
    )

    expect(deps.fetch).toHaveBeenCalledTimes(1)
    expect(deps.fetch).toHaveBeenCalledWith('/api/time-zone', expect.objectContaining({ method: 'GET' }))
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it.each([
    ['fallback' as const, 'UTC'],
    ['auto' as const, 'UTC'],
  ])('posts one changed automatic zone and reloads once from %s state', async (timeZoneSource, timeZone) => {
    const deps = dependencies([
      jsonResponse({ authenticated: true, manualTimeZone: null }),
      jsonResponse({ mode: 'auto', timeZone: 'Asia/Shanghai', changed: true }),
    ])

    await synchronizeTimeZone({ timeZone, timeZoneSource }, deps)

    expect(deps.fetch).toHaveBeenCalledTimes(2)
    expect(deps.fetch).toHaveBeenLastCalledWith('/api/time-zone', expect.objectContaining({
      body: JSON.stringify({ mode: 'auto', timeZone: 'Asia/Shanghai' }),
      method: 'POST',
    }))
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('synchronizes a remote manual preference before browser detection', async () => {
    const deps = dependencies([
      jsonResponse({ authenticated: true, manualTimeZone: 'UTC' }),
      jsonResponse({ mode: 'manual', timeZone: 'UTC', changed: true }),
    ])

    await synchronizeTimeZone(
      { timeZone: 'Asia/Shanghai', timeZoneSource: 'auto' },
      deps,
    )

    expect(deps.detectTimeZone).not.toHaveBeenCalled()
    expect(deps.fetch).toHaveBeenLastCalledWith('/api/time-zone', expect.objectContaining({
      body: JSON.stringify({ mode: 'manual', timeZone: 'UTC' }),
      method: 'POST',
    }))
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('retains a matching authenticated manual preference without a redundant write or reload', async () => {
    const deps = dependencies([jsonResponse({ authenticated: true, manualTimeZone: 'UTC' })])

    await synchronizeTimeZone(
      { timeZone: 'UTC', timeZoneSource: 'manual' },
      deps,
    )

    expect(deps.fetch).toHaveBeenCalledTimes(1)
    expect(deps.detectTimeZone).not.toHaveBeenCalled()
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('repairs a stale manual cookie on the next load after a manual A to B cookie-sync failure', async () => {
    const deps = dependencies([
      jsonResponse({ authenticated: true, manualTimeZone: 'Asia/Shanghai' }),
      jsonResponse({ mode: 'manual', timeZone: 'Asia/Shanghai', changed: true }),
    ])

    await synchronizeTimeZone(
      { timeZone: 'UTC', timeZoneSource: 'manual' },
      deps,
    )

    expect(deps.detectTimeZone).not.toHaveBeenCalled()
    expect(deps.fetch).toHaveBeenLastCalledWith('/api/time-zone', expect.objectContaining({
      body: JSON.stringify({ mode: 'manual', timeZone: 'Asia/Shanghai' }),
      method: 'POST',
    }))
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('repairs a stale manual cookie on the next load after an Automatic cookie-sync failure', async () => {
    const deps = dependencies([
      jsonResponse({ authenticated: true, manualTimeZone: null }),
      jsonResponse({ mode: 'auto', timeZone: 'Asia/Shanghai', changed: true }),
    ])

    await synchronizeTimeZone(
      { timeZone: 'UTC', timeZoneSource: 'manual' },
      deps,
    )

    expect(deps.detectTimeZone).toHaveBeenCalledTimes(1)
    expect(deps.fetch).toHaveBeenLastCalledWith('/api/time-zone', expect.objectContaining({
      body: JSON.stringify({ mode: 'auto', timeZone: 'Asia/Shanghai' }),
      method: 'POST',
    }))
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('retains an existing manual cookie for a signed-out browser', async () => {
    const deps = dependencies([jsonResponse({ authenticated: false, manualTimeZone: null })])

    await synchronizeTimeZone(
      { timeZone: 'UTC', timeZoneSource: 'manual' },
      deps,
    )

    expect(deps.fetch).toHaveBeenCalledTimes(1)
    expect(deps.detectTimeZone).not.toHaveBeenCalled()
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('reloads a stale render when another tab already changed the cookie', async () => {
    const deps = dependencies([
      jsonResponse({ authenticated: true, manualTimeZone: null }),
      jsonResponse({ mode: 'auto', timeZone: 'Asia/Shanghai', changed: false }),
    ])

    await synchronizeTimeZone(
      { timeZone: 'UTC', timeZoneSource: 'fallback' },
      deps,
    )

    expect(deps.fetch).toHaveBeenCalledTimes(2)
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload an unchanged render when the desired cookie already exists', async () => {
    const deps = dependencies([
      jsonResponse({ authenticated: true, manualTimeZone: null }),
      jsonResponse({ mode: 'auto', timeZone: 'Asia/Shanghai', changed: false }),
    ])

    await synchronizeTimeZone(
      { timeZone: 'Asia/Shanghai', timeZoneSource: 'fallback' },
      deps,
    )

    expect(deps.fetch).toHaveBeenCalledTimes(2)
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('stops when manual lookup fails so automatic state cannot mask a profile override', async () => {
    const deps = dependencies([jsonResponse({ error: 'Unavailable' }, false)])

    await synchronizeTimeZone(
      { timeZone: 'UTC', timeZoneSource: 'fallback' },
      deps,
    )

    expect(deps.fetch).toHaveBeenCalledTimes(1)
    expect(deps.detectTimeZone).not.toHaveBeenCalled()
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('runs the post-hydration GET and POST only once under StrictMode', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: true, manualTimeZone: null }))
      .mockResolvedValueOnce(jsonResponse({ mode: 'auto', timeZone: 'UTC', changed: false }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <StrictMode>
        <TimeZoneBootstrap timeZone="UTC" timeZoneSource="fallback" />
      </StrictMode>,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'POST'])
  })
})
