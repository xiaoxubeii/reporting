import type { Domain } from '@/lib/access/domains'
import type { FeatureKey } from '@/lib/types/features'

export type BackgroundJobKind = string
export type BackgroundJobActorType = 'user' | 'system'
export type BackgroundJobAudience = `reporting-${string}`
export type BackgroundJobScope = `${string}:${string}`
export type BackgroundJobPayload = Readonly<Record<string, unknown>>

export interface DealResearchPayload extends BackgroundJobPayload {
  readonly dealId: string
}

export interface MemoResearchPayload extends BackgroundJobPayload {
  readonly memoJobId: string
  readonly dealId: string
  readonly draftId: string
}

export type FeedDiscoveryPayload = Readonly<Record<never, never>>

export interface BackgroundJobPayloadByKind {
  readonly deal_research: DealResearchPayload
  readonly memo_research: MemoResearchPayload
  readonly feed_discovery: FeedDiscoveryPayload
}

export interface BackgroundJobSearchCapability {
  readonly audience: BackgroundJobAudience
  readonly scope: BackgroundJobScope
  readonly maxCalls: number
  readonly allowPersonalSources: boolean
  readonly requiredUserAccess: BackgroundJobPolicy['requiredUserAccess']
}

export interface BackgroundJobPolicy<K extends string = string> {
  readonly kind: K
  readonly actors: readonly BackgroundJobActorType[]
  readonly parsePayload: (value: unknown) => BackgroundJobPayload
  readonly workerPath: string
  readonly workerAudience: BackgroundJobAudience
  readonly workerScope: BackgroundJobScope
  readonly requiredUserAccess: readonly Readonly<{
    domain: Domain
    need: 'read' | 'write'
    feature?: FeatureKey
  }>[]
  readonly search?: BackgroundJobSearchCapability
  readonly maxAttempts: number
  readonly leaseSeconds: number
  readonly requestTimeoutMs: number
}

export interface VerifiedBackgroundJobToken {
  readonly jobId: string
  readonly attemptId: string
  readonly audience: BackgroundJobAudience
  readonly tokenId: string
}
