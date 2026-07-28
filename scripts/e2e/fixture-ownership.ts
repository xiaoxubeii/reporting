export type E2EFundOwnershipState = Readonly<{
  runId: string
  suffix: string
  email: string
  userId: string
  fundId: string
  fundName: string
  fundSlug: string
}>

export type E2EFundOwnershipSnapshot = Readonly<{
  user: Readonly<{
    email: string | null
    metadata: Readonly<Record<string, unknown>>
  }> | null
  fund: Readonly<{
    id: string
    name: string
    slug: string
    createdBy: string | null
  }> | null
}>

/**
 * Derived fixtures may only extend a Fund created by the same E2E run.
 * Validate both the owner identity and the persisted Fund identity so a
 * copied or edited state file cannot redirect writes into another tenant.
 */
export function assertOwnedE2EFundTarget(
  state: E2EFundOwnershipState,
  runId: string,
  snapshot: E2EFundOwnershipSnapshot,
): void {
  const stateOwned = state.runId === runId
    && state.email.endsWith(`-${state.suffix}@example.invalid`)
  const userOwned = snapshot.user?.email === state.email
    && snapshot.user.metadata.e2e === true
    && snapshot.user.metadata.e2e_run_id === runId
  const fundOwned = snapshot.fund?.id === state.fundId
    && snapshot.fund.name === state.fundName
    && snapshot.fund.slug === state.fundSlug
    && snapshot.fund.createdBy === state.userId

  if (!stateOwned || !userOwned || !fundOwned) {
    throw new Error('Target Fund does not belong to this E2E run')
  }
}
