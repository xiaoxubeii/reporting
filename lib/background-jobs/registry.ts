import { DOMAINS, domainForFeature } from '@/lib/access/domains'
import { DEFAULT_FEATURE_VISIBILITY, type FeatureKey } from '@/lib/types/features'
import type {
  BackgroundJobAudience,
  BackgroundJobPayload,
  BackgroundJobPayloadByKind,
  BackgroundJobPolicy,
  BackgroundJobSearchCapability,
} from './types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KIND_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const AUDIENCE_PATTERN = /^reporting-[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/
const SCOPE_PATTERN = /^[a-z][a-z0-9-]{0,63}:[a-z][a-z0-9-]{0,63}$/
const MAX_WORKER_TIMEOUT_MS = 270_000
const DOMAIN_SET = new Set<string>(DOMAINS)
const FEATURE_SET = new Set<string>(Object.keys(DEFAULT_FEATURE_VISIBILITY))

function parseDealResearchPayload(value: unknown): Readonly<BackgroundJobPayloadByKind['deal_research']> {
  if (!isPlainObject(value)) throw new Error('Invalid deal_research payload')
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== 'dealId' || typeof value.dealId !== 'string' || !UUID_PATTERN.test(value.dealId)) {
    throw new Error('Invalid deal_research payload')
  }
  return Object.freeze({ dealId: value.dealId })
}

function parseMemoResearchPayload(value: unknown): Readonly<BackgroundJobPayloadByKind['memo_research']> {
  if (!isPlainObject(value)) throw new Error('Invalid memo_research payload')
  const keys = Object.keys(value)
  if (
    keys.length !== 3
    || !keys.every(key => key === 'memoJobId' || key === 'dealId' || key === 'draftId')
    || typeof value.memoJobId !== 'string'
    || typeof value.dealId !== 'string'
    || typeof value.draftId !== 'string'
    || !UUID_PATTERN.test(value.memoJobId)
    || !UUID_PATTERN.test(value.dealId)
    || !UUID_PATTERN.test(value.draftId)
  ) {
    throw new Error('Invalid memo_research payload')
  }
  return Object.freeze({
    memoJobId: value.memoJobId,
    dealId: value.dealId,
    draftId: value.draftId,
  })
}

function parseFeedDiscoveryPayload(value: unknown): Readonly<BackgroundJobPayloadByKind['feed_discovery']> {
  if (!isPlainObject(value) || Object.keys(value).length !== 0) {
    throw new Error('Invalid feed_discovery payload')
  }
  return Object.freeze({})
}

const DEAL_RESEARCH_SEARCH = Object.freeze({
  audience: 'reporting-search',
  scope: 'search:execute',
  maxCalls: 3,
  allowPersonalSources: false,
  requiredUserAccess: Object.freeze([
    Object.freeze({ domain: 'dealflow', need: 'read', feature: 'search' }),
  ]),
} satisfies BackgroundJobSearchCapability)

const DEAL_RESEARCH_POLICY = Object.freeze({
  kind: 'deal_research',
  actors: Object.freeze(['user', 'system'] as const),
  parsePayload: parseDealResearchPayload,
  workerPath: '/api/internal/background-jobs/deal-research/run',
  workerAudience: 'reporting-deal-research-worker',
  workerScope: 'deal-research:execute',
  requiredUserAccess: Object.freeze([
    Object.freeze({ domain: 'dealflow', need: 'write' }),
  ]),
  search: DEAL_RESEARCH_SEARCH,
  maxAttempts: 3,
  leaseSeconds: 300,
  requestTimeoutMs: 270_000,
} satisfies BackgroundJobPolicy<'deal_research'>)

const MEMO_RESEARCH_POLICY = Object.freeze({
  kind: 'memo_research',
  actors: Object.freeze(['user'] as const),
  parsePayload: parseMemoResearchPayload,
  workerPath: '/api/internal/background-jobs/memo-research/run',
  workerAudience: 'reporting-memo-research-worker',
  workerScope: 'memo-research:execute',
  requiredUserAccess: Object.freeze([
    Object.freeze({ domain: 'diligence', need: 'write' }),
  ]),
  search: DEAL_RESEARCH_SEARCH,
  maxAttempts: 3,
  leaseSeconds: 300,
  requestTimeoutMs: 270_000,
} satisfies BackgroundJobPolicy<'memo_research'>)

const FEED_DISCOVERY_POLICY = Object.freeze({
  kind: 'feed_discovery',
  actors: Object.freeze(['system'] as const),
  parsePayload: parseFeedDiscoveryPayload,
  workerPath: '/api/internal/background-jobs/feed-discovery/run',
  workerAudience: 'reporting-feed-discovery-worker',
  workerScope: 'feed-discovery:execute',
  requiredUserAccess: Object.freeze([]),
  maxAttempts: 3,
  leaseSeconds: 300,
  requestTimeoutMs: 270_000,
} satisfies BackgroundJobPolicy<'feed_discovery'>)

export interface BackgroundJobRegistry {
  list(): readonly BackgroundJobPolicy[]
  get(kind: string): BackgroundJobPolicy
}

const POLICIES = Object.freeze([DEAL_RESEARCH_POLICY, MEMO_RESEARCH_POLICY, FEED_DISCOVERY_POLICY] as const)
export const backgroundJobRegistry = createBackgroundJobRegistry(POLICIES)
export const BACKGROUND_JOB_KINDS = Object.freeze(backgroundJobRegistry.list().map(policy => policy.kind))

export function listBackgroundJobPolicies(): readonly BackgroundJobPolicy[] {
  return backgroundJobRegistry.list()
}

export function isBackgroundJobKind(value: string): boolean {
  return backgroundJobRegistry.list().some(policy => policy.kind === value)
}

export function backgroundJobPolicy(kind: string): BackgroundJobPolicy {
  return backgroundJobRegistry.get(kind)
}

export function createBackgroundJobRegistry(
  policiesInput: readonly BackgroundJobPolicy[],
): BackgroundJobRegistry {
  validateBackgroundJobPolicies(policiesInput)
  const policies = Object.freeze(policiesInput.map(freezeBackgroundJobPolicy))
  return Object.freeze({
    list: () => policies,
    get: (kind: string) => {
      const policy = policies.find(candidate => candidate.kind === kind)
      if (policy) return policy
      throw new Error('Unsupported background job kind')
    },
  })
}

export function validateBackgroundJobRegistry(
  registry: BackgroundJobRegistry,
): readonly BackgroundJobPolicy[] {
  const policies = registry.list()
  validateBackgroundJobPolicies(policies)
  for (const policy of policies) {
    if (registry.get(policy.kind) !== policy) throw new Error('Invalid background job registry')
  }
  return policies
}

export function backgroundJobSearchPolicy(kind: string): BackgroundJobSearchCapability {
  const search = backgroundJobPolicy(kind).search
  if (!search) throw new Error('Background job kind does not allow Search')
  return search
}

export function isBackgroundJobAudience(value: string): value is BackgroundJobAudience {
  return backgroundJobRegistry.list().some(policy => (
    policy.workerAudience === value || policy.search?.audience === value
  ))
}

function validateBackgroundJobPolicies(policies: readonly BackgroundJobPolicy[]): void {
  if (policies.length < 1 || policies.length > 100) throw new Error('Invalid background job registry')
  const kinds = new Set<string>()
  const workerPaths = new Set<string>()
  const workerAudiences = new Set<string>()
  const searchAudiences = new Map<string, string>()

  for (const policy of policies) {
    const expectedWorkerPath = `/api/internal/background-jobs/${policy.kind.replaceAll('_', '-')}/run`
    if (
      !KIND_PATTERN.test(policy.kind)
      || kinds.has(policy.kind)
      || policy.workerPath !== expectedWorkerPath
      || workerPaths.has(policy.workerPath)
      || !AUDIENCE_PATTERN.test(policy.workerAudience)
      || workerAudiences.has(policy.workerAudience)
      || !SCOPE_PATTERN.test(policy.workerScope)
      || typeof policy.parsePayload !== 'function'
      || !Number.isInteger(policy.maxAttempts)
      || policy.maxAttempts < 1
      || policy.maxAttempts > 20
      || !Number.isInteger(policy.leaseSeconds)
      || policy.leaseSeconds < 30
      || policy.leaseSeconds > 1800
      || !Number.isInteger(policy.requestTimeoutMs)
      || policy.requestTimeoutMs < 1
      || policy.requestTimeoutMs > MAX_WORKER_TIMEOUT_MS
      || policy.requestTimeoutMs >= policy.leaseSeconds * 1000
      || policy.actors.length < 1
      || new Set(policy.actors).size !== policy.actors.length
      || policy.actors.some(actor => actor !== 'user' && actor !== 'system')
    ) {
      throw new Error('Invalid background job registry')
    }
    validateRequiredUserAccess(policy.requiredUserAccess)
    if (policy.search) {
      validateRequiredUserAccess(policy.search.requiredUserAccess)
      const priorScope = searchAudiences.get(policy.search.audience)
      if (
        !AUDIENCE_PATTERN.test(policy.search.audience)
        || !SCOPE_PATTERN.test(policy.search.scope)
        || !Number.isInteger(policy.search.maxCalls)
        || policy.search.maxCalls < 1
        || policy.search.maxCalls > 10
        || typeof policy.search.allowPersonalSources !== 'boolean'
        || (priorScope !== undefined && priorScope !== policy.search.scope)
      ) {
        throw new Error('Invalid background job registry')
      }
      searchAudiences.set(policy.search.audience, policy.search.scope)
    }
    kinds.add(policy.kind)
    workerPaths.add(policy.workerPath)
    workerAudiences.add(policy.workerAudience)
  }

  for (const audience of Array.from(workerAudiences)) {
    if (searchAudiences.has(audience)) throw new Error('Invalid background job registry')
  }
}

function validateRequiredUserAccess(requirements: unknown): void {
  if (!Array.isArray(requirements) || requirements.length > 20) {
    throw new Error('Invalid background job registry')
  }
  const seen = new Set<string>()
  for (const requirement of requirements) {
    if (!isPlainObject(requirement)) throw new Error('Invalid background job registry')
    const keys = Object.keys(requirement)
    const feature = requirement.feature
    if (
      keys.some(key => key !== 'domain' && key !== 'need' && key !== 'feature')
      || keys.length < 2
      || keys.length > 3
      || !DOMAIN_SET.has(String(requirement.domain))
      || (requirement.need !== 'read' && requirement.need !== 'write')
      || (feature !== undefined && (
        typeof feature !== 'string'
        || !FEATURE_SET.has(feature)
        || domainForFeature(feature as FeatureKey) !== requirement.domain
      ))
    ) {
      throw new Error('Invalid background job registry')
    }
    const signature = `${requirement.domain}:${requirement.need}:${feature ?? ''}`
    if (seen.has(signature)) throw new Error('Invalid background job registry')
    seen.add(signature)
  }
}

function freezeBackgroundJobPolicy(policy: BackgroundJobPolicy): BackgroundJobPolicy {
  return Object.freeze({
    ...policy,
    actors: Object.freeze([...policy.actors]),
    requiredUserAccess: Object.freeze(policy.requiredUserAccess.map(requirement => Object.freeze({
      ...requirement,
    }))),
    search: policy.search ? Object.freeze({
      ...policy.search,
      requiredUserAccess: Object.freeze(policy.search.requiredUserAccess.map(requirement => Object.freeze({
        ...requirement,
      }))),
    }) : undefined,
  })
}

export function parseBackgroundJobPayload<K extends keyof BackgroundJobPayloadByKind>(
  kind: K,
  value: unknown,
): Readonly<BackgroundJobPayloadByKind[K]>
export function parseBackgroundJobPayload(kind: string, value: unknown): BackgroundJobPayload
export function parseBackgroundJobPayload(kind: string, value: unknown): BackgroundJobPayload {
  return backgroundJobPolicy(kind).parsePayload(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
