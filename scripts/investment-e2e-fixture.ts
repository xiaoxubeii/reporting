import { constants } from 'node:fs'
import { mkdtemp, open, rmdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadMinifluxProvisionerToken } from '../lib/feeds/config'
import { managedMinifluxUsername } from '../lib/feeds/miniflux/provisioning'
import type { Database } from '../lib/types/database'
import { assertOwnedE2EFundTarget } from './e2e/fixture-ownership'
import { forceDeleteLocalFundIdentity } from './e2e/local-fund-cleanup'

const STATE_DIRECTORY_PREFIX = join(tmpdir(), 'reporting-investment-e2e-')
interface BaseFixtureState {
  readonly runId: string
  readonly suffix: string
  readonly email: string
  readonly password: string
  readonly userId: string
  readonly fundName: string
  readonly fundSlug: string
}

interface FundFixtureState extends BaseFixtureState {
  readonly kind: 'fund'
  readonly fundId: string
  readonly submissionToken: string
  readonly inboundAddress: string
  readonly inboundToken: string
}

interface OnboardingFixtureState extends BaseFixtureState {
  readonly kind: 'onboarding'
}

interface LpFixtureState extends BaseFixtureState {
  readonly kind: 'lp'
  readonly fundId: string
  readonly lpAccountId: string
  readonly lpInvestorId: string
  readonly marker: string
}

interface MemberFixtureState extends BaseFixtureState {
  readonly kind: 'member'
  readonly fundId: string
  readonly role: 'member' | 'viewer'
}

type FixtureState = FundFixtureState | OnboardingFixtureState | LpFixtureState | MemberFixtureState

function assertStatePath(stateFile: string): string {
  const absolutePath = resolve(stateFile)
  if (!absolutePath.startsWith(STATE_DIRECTORY_PREFIX) || dirname(absolutePath) === tmpdir()) {
    throw new Error('Fixture state must be inside a generated investment E2E directory')
  }
  return absolutePath
}

async function readState(stateFile: string): Promise<FixtureState> {
  const safePath = assertStatePath(stateFile)
  const handle = await open(safePath, constants.O_RDONLY | constants.O_NOFOLLOW)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(await handle.readFile('utf8')) as Record<string, unknown>
  } finally {
    await handle.close()
  }
  const commonFields = ['runId', 'suffix', 'email', 'password', 'userId', 'fundName', 'fundSlug'] as const
  if (!commonFields.every(field => typeof parsed[field] === 'string' && parsed[field].length > 0)) {
    throw new Error(`Invalid fixture state in ${safePath}`)
  }
  if (parsed.kind === 'fund') {
    if (
      typeof parsed.fundId !== 'string'
      || typeof parsed.submissionToken !== 'string'
      || typeof parsed.inboundAddress !== 'string'
      || typeof parsed.inboundToken !== 'string'
    ) {
      throw new Error(`Invalid Fund fixture state in ${safePath}`)
    }
    return parsed as unknown as FundFixtureState
  }
  if (parsed.kind === 'onboarding') return parsed as unknown as OnboardingFixtureState
  if (parsed.kind === 'lp') {
    const lpFields = ['fundId', 'lpAccountId', 'lpInvestorId', 'marker'] as const
    if (!lpFields.every(field => typeof parsed[field] === 'string' && parsed[field].length > 0)) {
      throw new Error(`Invalid LP fixture state in ${safePath}`)
    }
    return parsed as unknown as LpFixtureState
  }
  if (parsed.kind === 'member') {
    if (
      typeof parsed.fundId !== 'string'
      || !['member', 'viewer'].includes(String(parsed.role))
    ) {
      throw new Error(`Invalid member fixture state in ${safePath}`)
    }
    return parsed as unknown as MemberFixtureState
  }
  throw new Error(`Unknown fixture kind in ${safePath}`)
}

async function writeState(state: FixtureState): Promise<string> {
  const directory = await mkdtemp(STATE_DIRECTORY_PREFIX)
  const stateFile = join(directory, 'state.json')
  const handle = await open(
    stateFile,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600
  )
  try {
    await handle.writeFile(JSON.stringify(state), 'utf8')
  } finally {
    await handle.close()
  }
  return stateFile
}

async function verifyOwnedFundTarget(
  admin: SupabaseClient<Database>,
  state: FixtureState,
  runId: string,
): Promise<FundFixtureState> {
  if (state.kind !== 'fund') throw new Error('A complete Fund fixture is required')
  const [ownedUser, ownedFund] = await Promise.all([
    admin.auth.admin.getUserById(state.userId),
    admin.from('funds').select('id, name, slug, created_by').eq('id', state.fundId).maybeSingle(),
  ])
  if (ownedUser.error || ownedFund.error) {
    throw new Error('Target Fund ownership could not be verified')
  }
  assertOwnedE2EFundTarget(state, runId, {
    user: ownedUser.data.user
      ? { email: ownedUser.data.user.email ?? null, metadata: ownedUser.data.user.user_metadata }
      : null,
    fund: ownedFund.data
      ? {
          id: ownedFund.data.id,
          name: ownedFund.data.name,
          slug: ownedFund.data.slug,
          createdBy: ownedFund.data.created_by,
        }
      : null,
  })
  return state
}

async function cleanupManagedMinifluxUser(userId: string): Promise<void> {
  const rawBaseUrl = process.env.MINIFLUX_BASE_URL?.trim()
  if (!rawBaseUrl || !process.env.MINIFLUX_PROVISIONER_TOKEN_FILE?.trim()) return
  const baseUrl = new URL(rawBaseUrl)
  if (!['127.0.0.1', 'localhost'].includes(baseUrl.hostname)) {
    throw new Error('Investment E2E cleanup may only target a local Miniflux instance')
  }
  const token = await loadMinifluxProvisionerToken()
  const headers = { Accept: 'application/json', 'X-Auth-Token': token }
  const usersResponse = await fetch(new URL('/v1/users', baseUrl), { headers })
  if (!usersResponse.ok) throw new Error(`Unable to list local Miniflux users: HTTP ${usersResponse.status}`)
  const users = await usersResponse.json() as Array<{ id?: unknown; username?: unknown }>
  const username = managedMinifluxUsername(userId)
  const user = users.find(candidate => candidate.username === username)
  if (!user) return
  if (typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new Error('Unable to identify the local Miniflux E2E user')
  }
  const deleted = await fetch(new URL(`/v1/users/${user.id}`, baseUrl), {
    method: 'DELETE',
    headers,
  })
  if (!deleted.ok && deleted.status !== 404) {
    throw new Error(`Unable to delete local Miniflux E2E user: HTTP ${deleted.status}`)
  }
}

async function deleteFixtureFund(
  admin: SupabaseClient<Database>,
  fundId: string,
  fundName: string,
  fundSlug: string,
  supabaseUrl: string,
): Promise<void> {
  const deletedFund = await admin.from('funds').delete().eq('id', fundId)
  if (!deletedFund.error) return
  if (!deletedFund.error.message.includes('Fund identity cannot be deleted')) {
    throw new Error(`Unable to delete E2E fund: ${deletedFund.error.message}`)
  }
  await forceDeleteLocalFundIdentity({ fundId, fundName, fundSlug, supabaseUrl })
}

async function main() {
  loadEnvConfig(process.cwd())
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole) throw new Error('Supabase admin environment is required')
  const parsedUrl = new URL(url)
  if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) {
    throw new Error('Investment E2E fixtures may only target a local Supabase instance')
  }

  const admin = createClient<Database>(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const action = process.argv[2] ?? 'create'
  const stateFile = process.argv[3]
  const runId = process.env.E2E_RUN_ID
  if (!runId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    throw new Error('E2E_RUN_ID must be a valid UUID')
  }
  if (action === 'cleanup') {
    if (!stateFile) throw new Error('cleanup requires the generated state file path')
    const safePath = assertStatePath(stateFile)
    const state = await readState(safePath)
    if (state.runId !== runId || !state.email.endsWith(`-${state.suffix}@example.invalid`)) {
      throw new Error('Fixture state does not belong to this E2E run')
    }
    const ownedUser = await admin.auth.admin.getUserById(state.userId)
    if (
      ownedUser.error
      || ownedUser.data.user?.email !== state.email
      || ownedUser.data.user.user_metadata?.e2e !== true
      || ownedUser.data.user.user_metadata?.e2e_run_id !== runId
    ) {
      throw new Error('Fixture user ownership could not be verified')
    }
    await cleanupManagedMinifluxUser(state.userId)
    if (state.kind === 'fund') {
      await deleteFixtureFund(admin, state.fundId, state.fundName, state.fundSlug, url)
    } else if (state.kind === 'lp') {
      // LP identity tables predate the generated Database surface used by this fixture.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deletedAccount = await (admin as any).from('lp_accounts').delete().eq('id', state.lpAccountId)
      if (deletedAccount.error) throw new Error(`Unable to delete E2E LP account: ${deletedAccount.error.message}`)
      const deletedInvestor = await admin.from('lp_investors').delete().eq('id', state.lpInvestorId)
      if (deletedInvestor.error) throw new Error(`Unable to delete E2E LP investor: ${deletedInvestor.error.message}`)
    } else if (state.kind === 'member') {
      const deletedAccess = await admin.from('fund_member_access').delete()
        .eq('fund_id', state.fundId)
        .eq('user_id', state.userId)
      if (deletedAccess.error) throw new Error(`Unable to delete E2E member access: ${deletedAccess.error.message}`)
      const deletedMembership = await admin.from('fund_members').delete()
        .eq('fund_id', state.fundId)
        .eq('user_id', state.userId)
      if (deletedMembership.error) throw new Error(`Unable to delete E2E membership: ${deletedMembership.error.message}`)
    } else {
      const createdFund = await admin
        .from('funds')
        .select('id, name, slug')
        .eq('created_by', state.userId)
        .eq('slug', state.fundSlug)
        .maybeSingle()
      if (createdFund.error) throw new Error(`Unable to locate onboarding E2E fund: ${createdFund.error.message}`)
      if (createdFund.data) {
        await deleteFixtureFund(
          admin,
          createdFund.data.id,
          createdFund.data.name,
          createdFund.data.slug,
          url,
        )
      }
    }
    const deletedUser = await admin.auth.admin.deleteUser(state.userId)
    if (deletedUser.error) throw new Error(`Unable to delete E2E user: ${deletedUser.error.message}`)
    await unlink(safePath)
    await rmdir(dirname(safePath))
    console.log(JSON.stringify({ fixture: 'cleaned' }))
    return
  }
  if (action === 'create-lp') {
    if (!stateFile) throw new Error('create-lp requires the target Fund fixture state file')
    const target = await verifyOwnedFundTarget(admin, await readState(stateFile), runId)

    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`
    const email = `lp-e2e-${suffix}@example.invalid`
    const password = `E2E-${randomUUID()}!aA9`
    const marker = `LP Investor ${suffix}`
    const createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { accepted_license_at: new Date().toISOString(), e2e: true, e2e_run_id: runId, identity: 'lp' },
    })
    if (createdUser.error || !createdUser.data.user) {
      throw new Error(`Unable to create LP E2E user: ${createdUser.error?.message ?? 'unknown error'}`)
    }
    const userId = createdUser.data.user.id
    let lpAccountId: string | null = null
    let lpInvestorId: string | null = null

    try {
      const investor = await admin.from('lp_investors').insert({
        fund_id: target.fundId,
        name: marker,
      }).select('id').single()
      if (investor.error || !investor.data) {
        throw new Error(`Unable to create E2E LP investor: ${investor.error?.message ?? 'unknown error'}`)
      }
      lpInvestorId = investor.data.id

      const entity = await admin.from('lp_entities').insert({
        fund_id: target.fundId,
        investor_id: lpInvestorId,
        entity_name: `${marker} Entity`,
      })
      if (entity.error) throw new Error(`Unable to create E2E LP entity: ${entity.error.message}`)

      // LP identity tables predate the generated Database surface used by this fixture.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = await (admin as any).from('lp_accounts').insert({
        auth_user_id: userId,
        kind: 'lp',
        email,
        display_name: marker,
        status: 'active',
      }).select('id').single()
      if (account.error || !account.data) {
        throw new Error(`Unable to create E2E LP account: ${account.error?.message ?? 'unknown error'}`)
      }
      lpAccountId = account.data.id as string

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const link = await (admin as any).from('lp_account_links').insert({
        lp_account_id: lpAccountId,
        fund_id: target.fundId,
        lp_investor_id: lpInvestorId,
      })
      if (link.error) throw new Error(`Unable to link E2E LP account: ${link.error.message}`)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const share = await (admin as any).from('lp_live_report_shares').insert({
        fund_id: target.fundId,
        lp_investor_id: lpInvestorId,
      })
      if (share.error) throw new Error(`Unable to share the E2E LP statement: ${share.error.message}`)

      const settings = await admin.from('fund_settings').update({ lp_portal_enabled: true }).eq('fund_id', target.fundId)
      if (settings.error) throw new Error(`Unable to enable the E2E LP portal: ${settings.error.message}`)

      const generatedStateFile = await writeState({
        kind: 'lp',
        runId,
        suffix,
        email,
        password,
        userId,
        fundId: target.fundId,
        fundName: target.fundName,
        fundSlug: target.fundSlug,
        lpAccountId,
        lpInvestorId,
        marker,
      })
      console.log(JSON.stringify({ fixture: 'created', kind: 'lp', userId, stateFile: generatedStateFile }))
      return
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (lpAccountId) await (admin as any).from('lp_accounts').delete().eq('id', lpAccountId)
      if (lpInvestorId) await admin.from('lp_investors').delete().eq('id', lpInvestorId)
      await admin.auth.admin.deleteUser(userId)
      throw error
    }
  }
  if (action === 'create-member') {
    if (!stateFile) throw new Error('create-member requires the target Fund fixture state file')
    const target = await verifyOwnedFundTarget(admin, await readState(stateFile), runId)
    const role = process.argv[4]
    if (role !== 'member' && role !== 'viewer') throw new Error('create-member role must be member or viewer')

    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`
    const email = `${role}-e2e-${suffix}@example.invalid`
    const password = `E2E-${randomUUID()}!aA9`
    const createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { accepted_license_at: new Date().toISOString(), e2e: true, e2e_run_id: runId, role },
    })
    if (createdUser.error || !createdUser.data.user) {
      throw new Error(`Unable to create ${role} E2E user: ${createdUser.error?.message ?? 'unknown error'}`)
    }
    const userId = createdUser.data.user.id
    try {
      const membership = await admin.from('fund_members').insert({
        fund_id: target.fundId,
        user_id: userId,
        role,
        display_name: `Investment E2E ${role}`,
      })
      if (membership.error) throw new Error(`Unable to create ${role} membership: ${membership.error.message}`)

      if (role === 'member') {
        const grant = await admin.from('fund_member_access').upsert({
          fund_id: target.fundId,
          user_id: userId,
          domain: 'dealflow',
          level: 'write',
          updated_by: target.userId,
        })
        if (grant.error) throw new Error(`Unable to grant member dealflow access: ${grant.error.message}`)
      }

      const sourceSettings = await admin.from('fund_settings')
        .select('feature_visibility')
        .eq('fund_id', target.fundId)
        .single()
      if (sourceSettings.error || !sourceSettings.data) throw new Error('Unable to load member fixture settings')
      const featureVisibility = {
        ...((sourceSettings.data.feature_visibility as Record<string, unknown> | null) ?? {}),
        deals: 'everyone',
      }
      const updatedSettings = await admin.from('fund_settings')
        .update({ feature_visibility: featureVisibility })
        .eq('fund_id', target.fundId)
      if (updatedSettings.error) throw new Error(`Unable to expose Deals to members: ${updatedSettings.error.message}`)

      const generatedStateFile = await writeState({
        kind: 'member',
        runId,
        suffix,
        email,
        password,
        userId,
        fundId: target.fundId,
        fundName: target.fundName,
        fundSlug: target.fundSlug,
        role,
      })
      console.log(JSON.stringify({ fixture: 'created', kind: 'member', role, userId, stateFile: generatedStateFile }))
      return
    } catch (error) {
      await admin.from('fund_member_access').delete().eq('fund_id', target.fundId).eq('user_id', userId)
      await admin.from('fund_members').delete().eq('fund_id', target.fundId).eq('user_id', userId)
      await admin.auth.admin.deleteUser(userId)
      throw error
    }
  }
  if (action === 'enable-diligence') {
    if (!stateFile) throw new Error('enable-diligence requires the generated state file path')
    const state = await verifyOwnedFundTarget(admin, await readState(stateFile), runId)
    const sourceSettings = await admin.from('fund_settings').select('feature_visibility').eq('fund_id', state.fundId).single()
    if (sourceSettings.error || !sourceSettings.data) throw new Error('Unable to load E2E fund settings')
    const featureVisibility = {
      ...((sourceSettings.data.feature_visibility as Record<string, unknown> | null) ?? {}),
      deals: 'admin',
      diligence: 'admin',
    }
    const updated = await admin.from('fund_settings').update({ feature_visibility: featureVisibility }).eq('fund_id', state.fundId)
    if (updated.error) throw new Error(`Unable to enable Diligence: ${updated.error.message}`)
    console.log(JSON.stringify({ fixture: 'updated', fundId: state.fundId, diligence: 'admin' }))
    return
  }
  if (action !== 'create' && action !== 'create-user') {
    throw new Error('Usage: investment-e2e-fixture.ts <create|create-user|create-lp|create-member> [target-state-file] [role] | <enable-diligence|cleanup> <state-file>')
  }
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const email = `investment-e2e-${suffix}@example.invalid`
  const password = `E2E-${randomUUID()}!aA9`
  const submissionToken = `e2e-${randomUUID()}`
  const inboundAddress = `e2e-${suffix}@inbound.localhost`
  const inboundToken = `e2e_${randomUUID().replaceAll('-', '')}_${randomUUID().replaceAll('-', '')}`
  const fundName = `Investment E2E ${suffix}`
  const fundSlug = `e2e-${suffix}`

  const createdUser = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { accepted_license_at: new Date().toISOString(), e2e: true, e2e_run_id: runId },
  })
  if (createdUser.error || !createdUser.data.user) {
    throw new Error(`Unable to create E2E user: ${createdUser.error?.message ?? 'unknown error'}`)
  }
  const userId = createdUser.data.user.id
  let fundId: string | null = null

  try {
    if (action === 'create-user') {
      const generatedStateFile = await writeState({
        kind: 'onboarding',
        runId,
        suffix,
        email,
        password,
        userId,
        fundName,
        fundSlug,
      })
      console.log(JSON.stringify({
        fixture: 'created',
        kind: 'onboarding',
        suffix,
        userId,
        stateFile: generatedStateFile,
      }))
      return
    }
    const fundResult = await admin
      .from('funds')
      .insert({
        name: fundName,
        created_by: userId,
        slug: fundSlug,
        email_subdomain: fundSlug,
      })
      .select('id, slug')
      .single()
    if (fundResult.error || !fundResult.data) {
      throw new Error(`Unable to create E2E fund: ${fundResult.error?.message ?? 'unknown error'}`)
    }
    fundId = fundResult.data.id as string
    if (fundResult.data.slug !== fundSlug) throw new Error('E2E Fund identity changed during creation')
    const membership = await admin.from('fund_members').upsert({
      fund_id: fundId,
      user_id: userId,
      role: 'admin',
      display_name: 'Investment E2E Admin',
    }, { onConflict: 'fund_id,user_id' })
    if (membership.error) throw new Error(`Unable to create membership: ${membership.error.message}`)

    const settings: Database['public']['Tables']['fund_settings']['Insert'] = {
      fund_id: fundId,
      deal_intake_enabled: true,
      deal_submission_token: submissionToken,
      inbound_email_provider: 'postmark',
      postmark_inbound_address: inboundAddress,
      postmark_webhook_token: inboundToken,
      deal_research_enabled: true,
      deal_research_min_fit: 'weak',
      deal_thesis: 'Cardiovascular diagnostics, therapeutics, devices, and clinical workflow software with credible clinical evidence.',
      memo_agent_web_search_enabled: false,
      feature_visibility: {
        deals: 'admin',
        diligence: 'admin',
        feeds: 'admin',
        search: 'admin',
      },
    }
    const insertedSettings = await admin.from('fund_settings').insert(settings)
    if (insertedSettings.error) throw new Error(`Unable to create fund settings: ${insertedSettings.error.message}`)

    const generatedStateFile = await writeState({
      kind: 'fund',
      runId,
      suffix,
      email,
      password,
      userId,
      fundId,
      fundName,
      fundSlug,
      submissionToken,
      inboundAddress,
      inboundToken,
    })
    console.log(JSON.stringify({
      fixture: 'created',
      suffix,
      userId,
      fundId,
      provider: 'unconfigured',
      stateFile: generatedStateFile,
    }))
  } catch (error) {
    if (fundId) {
      try {
        await deleteFixtureFund(admin, fundId, fundName, fundSlug, url)
      } catch (cleanupError) {
        console.error(`Failed to roll back E2E fund: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`)
      }
    }
    const deletedUser = await admin.auth.admin.deleteUser(userId)
    if (deletedUser.error) console.error(`Failed to roll back E2E user: ${deletedUser.error.message}`)
    throw error
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
