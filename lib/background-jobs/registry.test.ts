import { describe, expect, it } from 'vitest'

import {
  backgroundJobPolicy,
  backgroundJobSearchPolicy,
  BACKGROUND_JOB_KINDS,
  createBackgroundJobRegistry,
  isBackgroundJobAudience,
  listBackgroundJobPolicies,
  parseBackgroundJobPayload,
} from './registry'
import type { BackgroundJobPolicy } from './types'

const DEAL_ID = '842e532a-b848-457a-9b8e-4d6d8da10caf'
const DRAFT_ID = 'c321df20-ef87-4b9d-ad8e-c48f8e64a63a'
const MEMO_JOB_ID = '22945638-fd8f-4bd1-85e0-beb73ef2bf8b'

describe('background job registry', () => {
  it('registers Deal Research with fixed per-hop authority and bounded execution', () => {
    const policy = backgroundJobPolicy('deal_research')

    expect(policy).toMatchObject({
      kind: 'deal_research',
      workerPath: '/api/internal/background-jobs/deal-research/run',
      workerAudience: 'reporting-deal-research-worker',
      workerScope: 'deal-research:execute',
      maxAttempts: 3,
      search: {
        audience: 'reporting-search',
        scope: 'search:execute',
        maxCalls: 3,
        allowPersonalSources: false,
        requiredUserAccess: [{ domain: 'dealflow', need: 'read', feature: 'search' }],
      },
    })
    expect(policy.workerPath).not.toMatch(/^https?:/)
    expect(policy.requestTimeoutMs).toBeLessThan(policy.leaseSeconds * 1000)
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.search)).toBe(true)
  })

  it('registers Memo Research with Diligence and Search authority plus one shared tool budget', () => {
    const policy = backgroundJobPolicy('memo_research')

    expect(policy).toMatchObject({
      kind: 'memo_research',
      actors: ['user'],
      workerPath: '/api/internal/background-jobs/memo-research/run',
      workerAudience: 'reporting-memo-research-worker',
      workerScope: 'memo-research:execute',
      requiredUserAccess: [
        { domain: 'diligence', need: 'write' },
      ],
      maxAttempts: 3,
      search: {
        audience: 'reporting-search',
        scope: 'search:execute',
        maxCalls: 3,
        allowPersonalSources: false,
        requiredUserAccess: [{ domain: 'dealflow', need: 'read', feature: 'search' }],
      },
    })
    expect(policy.requestTimeoutMs).toBeLessThan(policy.leaseSeconds * 1000)
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.search)).toBe(true)
  })

  it('registers system-only Feed Discovery with an empty payload and fixed worker authority', () => {
    const policy = backgroundJobPolicy('feed_discovery')

    expect(policy).toMatchObject({
      kind: 'feed_discovery',
      actors: ['system'],
      workerPath: '/api/internal/background-jobs/feed-discovery/run',
      workerAudience: 'reporting-feed-discovery-worker',
      workerScope: 'feed-discovery:execute',
      requiredUserAccess: [],
      maxAttempts: 3,
    })
    expect(policy.search).toBeUndefined()
    expect(policy.requestTimeoutMs).toBeLessThan(policy.leaseSeconds * 1000)
    expect(parseBackgroundJobPayload('feed_discovery', {})).toEqual({})
    for (const payload of [null, [], { fundId: DEAL_ID }, { userId: DEAL_ID }]) {
      expect(() => parseBackgroundJobPayload('feed_discovery', payload)).toThrow('Invalid feed_discovery payload')
    }
  })

  it('enumerates one immutable code-owned policy per registered kind and derives audiences from it', () => {
    const policies = listBackgroundJobPolicies()
    expect(policies.map(policy => policy.kind)).toEqual([...BACKGROUND_JOB_KINDS])
    expect(new Set(policies.map(policy => policy.kind)).size).toBe(BACKGROUND_JOB_KINDS.length)
    expect(Object.isFrozen(policies)).toBe(true)
    expect(backgroundJobSearchPolicy('deal_research')).toEqual({
      audience: 'reporting-search',
      scope: 'search:execute',
      maxCalls: 3,
      allowPersonalSources: false,
      requiredUserAccess: [{ domain: 'dealflow', need: 'read', feature: 'search' }],
    })
    expect(backgroundJobSearchPolicy('memo_research')).toEqual({
      audience: 'reporting-search',
      scope: 'search:execute',
      maxCalls: 3,
      allowPersonalSources: false,
      requiredUserAccess: [{ domain: 'dealflow', need: 'read', feature: 'search' }],
    })
    expect(isBackgroundJobAudience('reporting-deal-research-worker')).toBe(true)
    expect(isBackgroundJobAudience('reporting-memo-research-worker')).toBe(true)
    expect(isBackgroundJobAudience('reporting-feed-discovery-worker')).toBe(true)
    expect(isBackgroundJobAudience('reporting-search')).toBe(true)
    expect(isBackgroundJobAudience('reporting-attacker')).toBe(false)
  })

  it('parses only the exact Deal Research payload', () => {
    expect(parseBackgroundJobPayload('deal_research', { dealId: DEAL_ID })).toEqual({ dealId: DEAL_ID })
    for (const payload of [
      {},
      { dealId: 'not-a-uuid' },
      { dealId: DEAL_ID, targetUrl: 'https://attacker.example' },
      { dealId: DEAL_ID, userId: DEAL_ID },
      null,
      [],
    ]) {
      expect(() => parseBackgroundJobPayload('deal_research', payload)).toThrow('Invalid deal_research payload')
    }
  })

  it('parses only the exact linked Memo Research payload', () => {
    expect(parseBackgroundJobPayload('memo_research', {
      memoJobId: MEMO_JOB_ID,
      dealId: DEAL_ID,
      draftId: DRAFT_ID,
    })).toEqual({ memoJobId: MEMO_JOB_ID, dealId: DEAL_ID, draftId: DRAFT_ID })

    for (const payload of [
      {},
      { memoJobId: MEMO_JOB_ID, dealId: DEAL_ID },
      { memoJobId: 'not-a-uuid', dealId: DEAL_ID, draftId: DRAFT_ID },
      { memoJobId: MEMO_JOB_ID, dealId: 'not-a-uuid', draftId: DRAFT_ID },
      { memoJobId: MEMO_JOB_ID, dealId: DEAL_ID, draftId: 'not-a-uuid' },
      { memoJobId: MEMO_JOB_ID, dealId: DEAL_ID, draftId: DRAFT_ID, targetUrl: 'https://attacker.example' },
      null,
      [],
    ]) {
      expect(() => parseBackgroundJobPayload('memo_research', payload)).toThrow('Invalid memo_research payload')
    }
  })

  it('fails closed for unknown job kinds', () => {
    expect(() => backgroundJobPolicy('arbitrary')).toThrow('Unsupported background job kind')
    expect(() => parseBackgroundJobPayload('arbitrary', {})).toThrow('Unsupported background job kind')
  })

  it('rejects unsafe or ambiguous registry entries before any work is claimed', () => {
    const deal = backgroundJobPolicy('deal_research')
    const notify = Object.freeze({
      ...deal,
      kind: 'test_notify',
      actors: Object.freeze(['system'] as const),
      workerPath: '/api/internal/background-jobs/test-notify/run',
      workerAudience: 'reporting-test-notify-worker' as const,
      workerScope: 'test-notify:execute' as const,
      requiredUserAccess: Object.freeze([]),
      search: undefined,
      maxAttempts: 2,
      leaseSeconds: 120,
      requestTimeoutMs: 60_000,
    } satisfies BackgroundJobPolicy)

    const invalidPolicies: readonly BackgroundJobPolicy[] = [
      { ...notify, workerPath: '/api/internal/background-jobs/other/run' },
      { ...notify, workerAudience: 'invalid' as typeof notify.workerAudience },
      { ...notify, workerScope: 'invalid' as typeof notify.workerScope },
      { ...notify, actors: Object.freeze([]) },
      { ...notify, maxAttempts: 21 },
      { ...notify, leaseSeconds: 29 },
      { ...notify, requestTimeoutMs: 270_001 },
      { ...notify, requiredUserAccess: undefined as unknown as BackgroundJobPolicy['requiredUserAccess'] },
      { ...notify, requiredUserAccess: [{ domain: 'unknown', need: 'read' }] as unknown as BackgroundJobPolicy['requiredUserAccess'] },
      { ...notify, requiredUserAccess: [{ domain: 'dealflow', need: 'admin' }] as unknown as BackgroundJobPolicy['requiredUserAccess'] },
      { ...notify, requiredUserAccess: [{ domain: 'dealflow', need: 'read', feature: 'serach' }] as unknown as BackgroundJobPolicy['requiredUserAccess'] },
      { ...notify, requiredUserAccess: [{ domain: 'accounting', need: 'read', feature: 'search' }] },
      {
        ...notify,
        requiredUserAccess: [
          { domain: 'dealflow', need: 'read', feature: 'search' },
          { domain: 'dealflow', need: 'read', feature: 'search' },
        ],
      },
      {
        ...notify,
        search: Object.freeze({
          audience: notify.workerAudience,
          scope: 'search:execute' as const,
          maxCalls: 1,
          allowPersonalSources: false,
          requiredUserAccess: [],
        }),
      },
    ]
    for (const policy of invalidPolicies) {
      expect(() => createBackgroundJobRegistry([policy])).toThrow('Invalid background job registry')
    }

    expect(() => createBackgroundJobRegistry([
      deal,
      { ...notify, workerAudience: deal.workerAudience },
    ])).toThrow('Invalid background job registry')
  })

  it('allows multiple kinds to share only the same registered Search audience and scope', () => {
    const deal = backgroundJobPolicy('deal_research')
    const notify = Object.freeze({
      ...deal,
      kind: 'test_notify',
      actors: Object.freeze(['system'] as const),
      workerPath: '/api/internal/background-jobs/test-notify/run',
      workerAudience: 'reporting-test-notify-worker' as const,
      workerScope: 'test-notify:execute' as const,
      requiredUserAccess: Object.freeze([]),
      maxAttempts: 2,
      leaseSeconds: 120,
      requestTimeoutMs: 60_000,
    } satisfies BackgroundJobPolicy)

    expect(createBackgroundJobRegistry([deal, notify]).list()).toHaveLength(2)
    expect(() => createBackgroundJobRegistry([
      deal,
      { ...notify, search: { ...notify.search!, scope: 'lookup:execute' as const } },
    ])).toThrow('Invalid background job registry')
  })

  it('deep-freezes the registered authority policy', () => {
    const registry = createBackgroundJobRegistry([backgroundJobPolicy('deal_research')])
    const policy = registry.get('deal_research')
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.actors)).toBe(true)
    expect(Object.isFrozen(policy.requiredUserAccess)).toBe(true)
    expect(policy.requiredUserAccess.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(policy.search)).toBe(true)
    expect(Object.isFrozen(policy.search?.requiredUserAccess)).toBe(true)
    expect(policy.search?.requiredUserAccess.every(Object.isFrozen)).toBe(true)
  })
})
