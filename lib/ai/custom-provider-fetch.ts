import { lookup } from 'node:dns'
import type { LookupAddress, LookupAllOptions } from 'node:dns'
import type { LookupFunction } from 'node:net'
import { Agent, type Dispatcher } from 'undici'

import { isNonPublicAddress } from '@/lib/validate-url'

const BLOCKED_ADDRESS_ERROR = 'Custom provider resolved to a non-public address'

export const safeCustomProviderLookup: LookupFunction = (hostname, options, callback) => {
  const lookupOptions: LookupAllOptions = {
    all: true,
    verbatim: true,
    ...(options.family ? { family: options.family } : {}),
    ...(options.hints === undefined ? {} : { hints: options.hints }),
  }

  lookup(hostname, lookupOptions, (error, addresses) => {
    if (error) {
      callback(error, [], undefined)
      return
    }

    if (addresses.length === 0 || addresses.some(({ address }) => isNonPublicAddress(address))) {
      const blockedError = Object.assign(new Error(BLOCKED_ADDRESS_ERROR), {
        code: 'ENOTFOUND',
      })
      callback(blockedError, [], undefined)
      return
    }

    if (options.all) {
      callback(null, addresses, undefined)
      return
    }

    const selected: LookupAddress = addresses[0]
    callback(null, selected.address, selected.family)
  })
}

const safeCustomProviderDispatcher = new Agent({
  connect: { lookup: safeCustomProviderLookup },
})

type DispatcherRequestInit = RequestInit & { dispatcher: Dispatcher }

export const noRedirectFetch: typeof fetch = (input, init) => fetch(input, {
  ...init,
  redirect: 'error',
})

export const safeCustomProviderFetch: typeof fetch = (input, init) => fetch(input, {
  ...init,
  redirect: 'error',
  dispatcher: safeCustomProviderDispatcher,
} as DispatcherRequestInit)
