import { describe, expect, it } from 'vitest'

import { assertOwnedE2EFundTarget } from '@/scripts/e2e/fixture-ownership'

const runId = '11111111-1111-4111-8111-111111111111'
const state = {
  runId,
  suffix: '1234-abcd',
  email: 'investment-e2e-1234-abcd@example.invalid',
  userId: 'user-a',
  fundId: 'fund-a',
  fundName: 'Investment E2E 1234-abcd',
  fundSlug: 'e2e-1234-abcd',
}
const snapshot = {
  user: {
    email: state.email,
    metadata: { e2e: true, e2e_run_id: runId },
  },
  fund: {
    id: state.fundId,
    name: state.fundName,
    slug: state.fundSlug,
    createdBy: state.userId,
  },
}

describe('E2E derived fixture ownership', () => {
  it('accepts the persisted Fund and owner created by the active run', () => {
    expect(() => assertOwnedE2EFundTarget(state, runId, snapshot)).not.toThrow()
  })

  it.each([
    ['another run', { ...state, runId: '22222222-2222-4222-8222-222222222222' }, snapshot],
    ['another Auth owner', state, { ...snapshot, user: { ...snapshot.user, email: 'other@example.invalid' } }],
    ['another Fund identity', state, { ...snapshot, fund: { ...snapshot.fund, slug: 'other-fund' } }],
    ['another Fund creator', state, { ...snapshot, fund: { ...snapshot.fund, createdBy: 'user-b' } }],
  ])('rejects %s before a derived fixture can write', (_label, candidateState, candidateSnapshot) => {
    expect(() => assertOwnedE2EFundTarget(candidateState, runId, candidateSnapshot))
      .toThrow('Target Fund does not belong to this E2E run')
  })
})
