import { readFile } from 'node:fs/promises'

export interface E2ETenantUserState {
  readonly suffix: string
  readonly email: string
  readonly password: string
  readonly userId: string
  readonly fundId: string
  readonly fundName: string
  readonly fundSlug: string
}

export interface E2EFixtureState extends E2ETenantUserState {
  readonly submissionToken: string
  readonly inboundAddress: string
  readonly inboundToken: string
}

export interface E2EMemberFixtureState extends E2ETenantUserState {
  readonly role: 'member' | 'viewer'
}

export interface E2EOnboardingFixtureState {
  readonly suffix: string
  readonly email: string
  readonly password: string
  readonly userId: string
  readonly fundName: string
  readonly fundSlug: string
}

export interface E2ELpFixtureState {
  readonly suffix: string
  readonly email: string
  readonly password: string
  readonly userId: string
  readonly fundId: string
  readonly fundName: string
  readonly fundSlug: string
  readonly lpAccountId: string
  readonly lpInvestorId: string
  readonly marker: string
}

export async function readE2EFixtureState(
  variable: 'E2E_PRIMARY_FIXTURE_STATE' | 'E2E_SECONDARY_FIXTURE_STATE',
): Promise<E2EFixtureState> {
  const stateFile = process.env[variable]
  if (!stateFile) throw new Error(`${variable} was not provided by Playwright global setup`)
  const state = JSON.parse(await readFile(stateFile, 'utf8')) as Partial<E2EFixtureState>
  if (
    !state.email
    || !state.password
    || !state.userId
    || !state.fundId
    || !state.fundName
    || !state.fundSlug
    || !state.submissionToken
    || !state.inboundAddress
    || !state.inboundToken
  ) {
    throw new Error(`${variable} does not contain a complete E2E fixture`)
  }
  return state as E2EFixtureState
}

export async function readE2EMemberFixtureState(
  variable: 'E2E_MEMBER_FIXTURE_STATE' | 'E2E_VIEWER_FIXTURE_STATE',
): Promise<E2EMemberFixtureState> {
  const stateFile = process.env[variable]
  if (!stateFile) throw new Error(`${variable} was not provided by Playwright global setup`)
  const state = JSON.parse(await readFile(stateFile, 'utf8')) as Partial<E2EMemberFixtureState>
  if (
    !state.suffix
    || !state.email
    || !state.password
    || !state.userId
    || !state.fundId
    || !state.fundName
    || !state.fundSlug
    || (state.role !== 'member' && state.role !== 'viewer')
  ) {
    throw new Error(`${variable} does not contain a complete member fixture`)
  }
  return state as E2EMemberFixtureState
}

export async function readE2EOnboardingFixtureState(): Promise<E2EOnboardingFixtureState> {
  const variable = 'E2E_ONBOARDING_FIXTURE_STATE'
  const stateFile = process.env[variable]
  if (!stateFile) throw new Error(`${variable} was not provided by Playwright global setup`)
  const state = JSON.parse(await readFile(stateFile, 'utf8')) as Partial<E2EOnboardingFixtureState>
  if (
    !state.suffix
    || !state.email
    || !state.password
    || !state.userId
    || !state.fundName
    || !state.fundSlug
  ) {
    throw new Error(`${variable} does not contain a complete onboarding fixture`)
  }
  return state as E2EOnboardingFixtureState
}

export async function readE2ELpFixtureState(): Promise<E2ELpFixtureState> {
  const variable = 'E2E_LP_FIXTURE_STATE'
  const stateFile = process.env[variable]
  if (!stateFile) throw new Error(`${variable} was not provided by Playwright global setup`)
  const state = JSON.parse(await readFile(stateFile, 'utf8')) as Partial<E2ELpFixtureState>
  if (
    !state.suffix
    || !state.email
    || !state.password
    || !state.userId
    || !state.fundId
    || !state.fundName
    || !state.fundSlug
    || !state.lpAccountId
    || !state.lpInvestorId
    || !state.marker
  ) {
    throw new Error(`${variable} does not contain a complete LP fixture`)
  }
  return state as E2ELpFixtureState
}
