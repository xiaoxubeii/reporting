import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test'

export interface BrowserFailure {
  kind: 'console' | 'page' | 'request' | 'response'
  message: string
  url?: string
  status?: number
  method?: string
}

export interface BrowserRecovery {
  url: string
  method: string
  status: number
}

export interface BrowserFailureAllowanceRule {
  kind: BrowserFailure['kind']
  pathname: string
  status?: number
}

export interface BrowserFailureAllowances {
  allow(rule: BrowserFailureAllowanceRule): void
  allows(failure: BrowserFailure): boolean
}

function isSuccessfulRecoveryStatus(status: number): boolean {
  return status >= 200 && status < 300
}

export async function retryNetworkChangedOnce<T>(
  operation: () => Promise<T>,
  pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 250)),
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof Error) || !/\bERR_NETWORK_CHANGED\b/.test(error.message)) throw error
    await pause()
    return operation()
  }
}

const ignoredConsolePatterns = [
  /Download the React DevTools/i,
]

function isFirstParty(urlValue: string): boolean {
  try {
    const { hostname } = new URL(urlValue)
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname.endsWith('.localhost')
  } catch {
    return false
  }
}

export function createBrowserFailureAllowances(): BrowserFailureAllowances {
  let rules: readonly BrowserFailureAllowanceRule[] = []

  return {
    allow(rule) {
      rules = [...rules, rule]
    },
    allows(failure) {
      if (!failure.url) return false
      let pathname: string
      try {
        pathname = new URL(failure.url).pathname
      } catch {
        return false
      }
      return rules.some(rule => rule.kind === failure.kind
        && rule.pathname === pathname
        && (rule.status === undefined || rule.status === failure.status))
    },
  }
}

export async function filterUnexpectedBrowserFailures(
  failures: readonly BrowserFailure[],
  allowances: BrowserFailureAllowances,
  probe: (url: string) => Promise<number | null>,
  recoveries: readonly BrowserRecovery[] = [],
): Promise<BrowserFailure[]> {
  const candidates = failures.filter(failure => !allowances.allows(failure))
  const networkChangedUrls = Array.from(new Set(candidates
    .filter(failure => failure.kind === 'request'
      && failure.method === 'GET'
      && failure.url
      && /ERR_NETWORK_CHANGED/.test(failure.message))
    .map(failure => failure.url as string)))
  const probeResults = new Map<string, boolean>()
  await Promise.all(networkChangedUrls.map(async url => {
    let status: number | null = null
    try {
      status = await probe(url)
    } catch {
      status = null
    }
    probeResults.set(url, status !== null && isSuccessfulRecoveryStatus(status))
  }))
  const wasRecovered = (failure: BrowserFailure): boolean => {
    if (failure.method === 'GET' && failure.url && probeResults.get(failure.url)) return true
    return Boolean(failure.url && failure.method && recoveries.some(recovery => (
      recovery.url === failure.url
      && recovery.method === failure.method
      && isSuccessfulRecoveryStatus(recovery.status)
    )))
  }
  const recoveredNetworkFailures = candidates.filter(failure => (
    /ERR_NETWORK_CHANGED/.test(failure.message) && wasRecovered(failure)
  ))
  const recoveredUrls = new Set(recoveredNetworkFailures
    .map(failure => failure.url)
    .filter((url): url is string => Boolean(url)))
  return candidates.filter(failure => {
    if (failure.url && /ERR_NETWORK_CHANGED/.test(failure.message)) {
      if (failure.kind === 'console') return !recoveredUrls.has(failure.url)
      return !wasRecovered(failure)
    }
    return true
  })
}

export function installPageObserver(
  page: Page,
  failures: BrowserFailure[],
  recoveries: BrowserRecovery[] = [],
) {
  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (ignoredConsolePatterns.some(pattern => pattern.test(text))) return
    failures.push({
      kind: 'console',
      message: text,
      url: message.location().url || undefined,
      status: Number(text.match(/\b([45]\d{2})\b/)?.[1]) || undefined,
    })
  })
  page.on('pageerror', error => {
    failures.push({ kind: 'page', message: error.message, url: page.url() })
  })
  page.on('requestfailed', request => {
    const message = request.failure()?.errorText ?? 'request failed'
    if (message === 'net::ERR_ABORTED') return
    // First-party failures are always strict. Also retain transient network
    // failures for external assets so the bounded recovery probe can verify
    // that an integration really recovered instead of hiding console noise.
    if (!isFirstParty(request.url()) && !/ERR_NETWORK_CHANGED/.test(message)) return
    failures.push({
      kind: 'request',
      message,
      url: request.url(),
      method: request.method(),
    })
  })
  page.on('response', response => {
    if (!isFirstParty(response.url())) return
    if (isSuccessfulRecoveryStatus(response.status())) {
      const method = response.request().method()
      if (failures.some(failure => (
        failure.kind === 'request'
        && failure.url === response.url()
        && failure.method === method
        && /ERR_NETWORK_CHANGED/.test(failure.message)
      ))) {
        recoveries.push({ url: response.url(), method, status: response.status() })
      }
      return
    }
    if (response.status() < 500) return
    failures.push({
      kind: 'response',
      message: `HTTP ${response.status()} ${response.statusText()}`,
      url: response.url(),
      status: response.status(),
    })
  })
}

export function installContextObserver(
  context: BrowserContext,
  failures: BrowserFailure[],
  observed: WeakSet<Page>,
  recoveries: BrowserRecovery[] = [],
) {
  const observe = (page: Page) => {
    if (observed.has(page)) return
    observed.add(page)
    installPageObserver(page, failures, recoveries)
  }
  for (const page of context.pages()) observe(page)
  context.on('page', observe)
}

async function attachFailures(testInfo: TestInfo, failures: BrowserFailure[]) {
  await testInfo.attach('browser-failures.json', {
    body: Buffer.from(`${JSON.stringify(failures, null, 2)}\n`),
    contentType: 'application/json',
  })
}

type ObservedFixtures = {
  browserFailures: readonly BrowserFailure[]
  browserFailureAllowances: BrowserFailureAllowances
}

export const test = base.extend<ObservedFixtures>({
  browserFailureAllowances: async ({}, use) => {
    await use(createBrowserFailureAllowances())
  },
  browserFailures: [async ({ browser, context, browserFailureAllowances }, use, testInfo) => {
    const failures: BrowserFailure[] = []
    const recoveries: BrowserRecovery[] = []
    const observed = new WeakSet<Page>()
    installContextObserver(context, failures, observed, recoveries)

    const originalNewContext = browser.newContext.bind(browser)
    const mutableBrowser = browser as Browser & {
      newContext: Browser['newContext']
    }
    mutableBrowser.newContext = async options => {
      const child = await originalNewContext(options)
      installContextObserver(child, failures, observed, recoveries)
      return child
    }

    try {
      await use(failures)
    } finally {
      mutableBrowser.newContext = originalNewContext
      const unexpectedFailures = await filterUnexpectedBrowserFailures(
        failures,
        browserFailureAllowances,
        async url => {
          await new Promise(resolve => setTimeout(resolve, 250))
          try {
            const response = await context.request.get(url, {
              failOnStatusCode: false,
              maxRedirects: 0,
              timeout: 5_000,
            })
            return response.status()
          } catch {
            return null
          }
        },
        recoveries,
      )
      await attachFailures(testInfo, failures)
      expect(unexpectedFailures, 'unexpected browser/runtime failures').toEqual([])
    }
  }, { auto: true }],
})

export { expect }
