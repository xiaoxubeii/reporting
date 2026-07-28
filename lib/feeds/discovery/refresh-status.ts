import type { DiscoveryReadState } from './runtime-store'
import type { DiscoveryRefreshStatus } from './contracts'

export type DiscoveryBackgroundJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface DiscoveryBackgroundJobSnapshot {
  readonly status: DiscoveryBackgroundJobStatus
  readonly updatedAt: string
}

export function deriveDiscoveryRefreshStatus(input: {
  readonly discovery: DiscoveryReadState
  readonly providerConfigured: boolean
  readonly latestJob: DiscoveryBackgroundJobSnapshot | null
  readonly isStale: boolean
}): DiscoveryRefreshStatus {
  const lastAttemptAt = input.latestJob?.updatedAt ?? input.discovery.lastAttemptAt
  if (input.latestJob?.status === 'pending') {
    return Object.freeze({ state: 'queued', reason: null, retryable: false, lastAttemptAt })
  }
  if (input.latestJob?.status === 'running') {
    return Object.freeze({ state: 'running', reason: null, retryable: false, lastAttemptAt })
  }
  if (
    input.latestJob?.status === 'failed'
    || input.latestJob?.status === 'cancelled'
    || input.discovery.lastErrorCode !== null
  ) {
    return Object.freeze({ state: 'degraded', reason: 'refresh_failed', retryable: true, lastAttemptAt })
  }
  if (!input.providerConfigured) {
    return Object.freeze({ state: 'degraded', reason: 'provider_not_configured', retryable: true, lastAttemptAt })
  }
  if (input.isStale) {
    return Object.freeze({ state: 'stale', reason: 'results_stale', retryable: true, lastAttemptAt })
  }
  return Object.freeze({ state: 'ready', reason: null, retryable: false, lastAttemptAt })
}
