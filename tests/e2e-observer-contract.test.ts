import { describe, expect, it, vi } from 'vitest'
import type { BrowserContext, Page } from '@playwright/test'
import {
  installContextObserver,
  installPageObserver,
  createBrowserFailureAllowances,
  filterUnexpectedBrowserFailures,
  retryNetworkChangedOnce,
  type BrowserFailure,
} from './e2e/support/observed-test'

function fakePage() {
  const listeners = new Map<string, Array<(value: unknown) => void>>()
  return {
    page: {
      on: vi.fn((event: string, listener: (value: unknown) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener])
      }),
      url: vi.fn(() => 'http://alpha.localhost:5010/dashboard'),
    } as unknown as Page,
    emit(event: string, value: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(value)
    },
  }
}

describe('comprehensive E2E browser failure observer', () => {
  it('retries a read navigation once only for ERR_NETWORK_CHANGED', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('page.goto: net::ERR_NETWORK_CHANGED'))
      .mockResolvedValueOnce('recovered')
    const pause = vi.fn(async () => undefined)

    await expect(retryNetworkChangedOnce(operation, pause)).resolves.toBe('recovered')
    expect(operation).toHaveBeenCalledTimes(2)
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it('does not retry unrelated failures or retry a second network change', async () => {
    const unrelated = vi.fn(async () => { throw new Error('net::ERR_CONNECTION_RESET') })
    await expect(retryNetworkChangedOnce(unrelated, vi.fn())).rejects.toThrow('ERR_CONNECTION_RESET')
    expect(unrelated).toHaveBeenCalledTimes(1)

    const repeated = vi.fn(async () => { throw new Error('net::ERR_NETWORK_CHANGED') })
    await expect(retryNetworkChangedOnce(repeated, vi.fn(async () => undefined)))
      .rejects.toThrow('ERR_NETWORK_CHANGED')
    expect(repeated).toHaveBeenCalledTimes(2)
  })

  it('records console errors, page errors, failed requests, and first-party 5xx responses', () => {
    const target = fakePage()
    const failures: BrowserFailure[] = []
    installPageObserver(target.page, failures)

    target.emit('console', {
      type: () => 'error',
      text: () => 'render failed',
      location: () => ({ url: 'http://alpha.localhost:5010/deals' }),
    })
    target.emit('pageerror', new Error('uncaught render error'))
    target.emit('requestfailed', {
      url: () => 'http://alpha.localhost:5010/api/deals',
      failure: () => ({ errorText: 'net::ERR_CONNECTION_RESET' }),
      method: () => 'GET',
    })
    target.emit('response', {
      url: () => 'http://alpha.localhost:5010/api/deals',
      status: () => 503,
      statusText: () => 'Service Unavailable',
    })

    expect(failures.map(failure => failure.kind)).toEqual([
      'console',
      'page',
      'request',
      'response',
    ])
  })

  it('observes existing pages and pages created later in the same context exactly once', () => {
    const first = fakePage()
    const second = fakePage()
    let pageListener: ((page: Page) => void) | undefined
    const context = {
      pages: () => [first.page],
      on: vi.fn((event: string, listener: (page: Page) => void) => {
        if (event === 'page') pageListener = listener
      }),
    } as unknown as BrowserContext
    const failures: BrowserFailure[] = []
    const observed = new WeakSet<Page>()

    installContextObserver(context, failures, observed)
    pageListener?.(second.page)
    pageListener?.(first.page)

    first.emit('pageerror', new Error('first'))
    second.emit('pageerror', new Error('second'))
    expect(failures.map(failure => failure.message)).toEqual(['first', 'second'])
  })

  it('allows only an explicitly matched failure kind, path, and status', () => {
    const allowances = createBrowserFailureAllowances()
    allowances.allow({
      kind: 'console',
      pathname: '/_supabase/auth/v1/token',
      status: 400,
    })

    expect(allowances.allows({
      kind: 'console',
      message: 'Failed to load resource: the server responded with a status of 400',
      url: 'http://alpha.localhost:5010/_supabase/auth/v1/token?grant_type=password',
      status: 400,
    })).toBe(true)
    expect(allowances.allows({
      kind: 'console',
      message: 'Internal Server Error',
      url: 'http://alpha.localhost:5010/_supabase/auth/v1/token?grant_type=password',
      status: 500,
    })).toBe(false)
  })

  it('keeps network-change failures only when a bounded retry does not recover', async () => {
    const allowances = createBrowserFailureAllowances()
    const failures: BrowserFailure[] = [
      { kind: 'request', method: 'GET', message: 'net::ERR_NETWORK_CHANGED', url: 'http://alpha.localhost:5010/api/deals' },
      { kind: 'console', message: 'Failed to load resource: net::ERR_NETWORK_CHANGED', url: 'http://alpha.localhost:5010/api/deals' },
      { kind: 'page', message: 'Failed to fetch', url: 'http://alpha.localhost:5010/deals' },
    ]

    await expect(filterUnexpectedBrowserFailures(failures, allowances, async () => 200)).resolves.toEqual([
      failures[2],
    ])
    await expect(filterUnexpectedBrowserFailures(failures, allowances, async () => 404)).resolves.toEqual(failures)
    await expect(filterUnexpectedBrowserFailures(failures, allowances, async () => 302)).resolves.toEqual(failures)
    await expect(filterUnexpectedBrowserFailures(failures, allowances, async () => 503)).resolves.toEqual(failures)
    await expect(filterUnexpectedBrowserFailures([
      { kind: 'request', method: 'GET', message: 'net::ERR_CONNECTION_RESET', url: 'http://alpha.localhost:5010/api/deals' },
    ], allowances, async () => 200)).resolves.toHaveLength(1)
  })

  it('never replays or clears a failed mutating request', async () => {
    const allowances = createBrowserFailureAllowances()
    const probe = vi.fn(async () => 200)
    const failure: BrowserFailure = {
      kind: 'request',
      method: 'POST',
      message: 'net::ERR_NETWORK_CHANGED',
      url: 'http://alpha.localhost:5010/api/deals',
    }

    await expect(filterUnexpectedBrowserFailures([failure], allowances, probe)).resolves.toEqual([failure])
    expect(probe).not.toHaveBeenCalled()
  })

  it('clears a mutating network failure only after the browser observes a successful user-level retry', async () => {
    const allowances = createBrowserFailureAllowances()
    const probe = vi.fn(async () => 200)
    const failure: BrowserFailure = {
      kind: 'request',
      method: 'POST',
      message: 'net::ERR_NETWORK_CHANGED',
      url: 'http://alpha.localhost:5010/api/diligence/id/documents/upload-url',
    }
    const recovery = {
      method: 'POST',
      status: 200,
      url: failure.url!,
    }

    await expect(filterUnexpectedBrowserFailures(
      [failure],
      allowances,
      probe,
      [recovery],
    )).resolves.toEqual([])
    expect(probe).not.toHaveBeenCalled()
  })

  it('does not treat a 4xx response as recovery or clear another same-origin failure', async () => {
    const allowances = createBrowserFailureAllowances()
    const requestFailure: BrowserFailure = {
      kind: 'request',
      method: 'POST',
      message: 'net::ERR_NETWORK_CHANGED',
      url: 'http://alpha.localhost:5010/api/deals',
    }
    const pageFailure: BrowserFailure = {
      kind: 'page',
      message: 'Failed to fetch',
      url: 'http://alpha.localhost:5010/deals',
    }

    await expect(filterUnexpectedBrowserFailures(
      [requestFailure, pageFailure],
      allowances,
      async () => 200,
      [{ method: 'POST', status: 409, url: requestFailure.url! }],
    )).resolves.toEqual([requestFailure, pageFailure])
  })
})
