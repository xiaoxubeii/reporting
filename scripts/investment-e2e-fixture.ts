import { constants } from 'node:fs'
import { mkdtemp, open, rmdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

const STATE_DIRECTORY_PREFIX = join(tmpdir(), 'reporting-investment-e2e-')
interface FixtureState {
  suffix: string
  email: string
  password: string
  userId: string
  fundId: string
  submissionToken: string
}

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
  let parsed: Partial<FixtureState>
  try {
    parsed = JSON.parse(await handle.readFile('utf8')) as Partial<FixtureState>
  } finally {
    await handle.close()
  }
  if (!parsed.userId || !parsed.fundId) {
    throw new Error(`Invalid fixture state in ${safePath}`)
  }
  return parsed as FixtureState
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

async function main() {
  loadEnvConfig(process.cwd())
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole) throw new Error('Supabase admin environment is required')
  const parsedUrl = new URL(url)
  if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) {
    throw new Error('Investment E2E fixtures may only target a local Supabase instance')
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const action = process.argv[2] ?? 'create'
  const stateFile = process.argv[3]
  if (action === 'cleanup') {
    if (!stateFile) throw new Error('cleanup requires the generated state file path')
    const safePath = assertStatePath(stateFile)
    const state = await readState(safePath)
    const deletedFund = await admin.from('funds').delete().eq('id', state.fundId)
    if (deletedFund.error) throw new Error(`Unable to delete E2E fund: ${deletedFund.error.message}`)
    const deletedUser = await admin.auth.admin.deleteUser(state.userId)
    if (deletedUser.error) throw new Error(`Unable to delete E2E user: ${deletedUser.error.message}`)
    await unlink(safePath)
    await rmdir(dirname(safePath))
    console.log(JSON.stringify({ fixture: 'cleaned' }))
    return
  }
  if (action === 'enable-diligence') {
    if (!stateFile) throw new Error('enable-diligence requires the generated state file path')
    const state = await readState(stateFile)
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
  if (action !== 'create') {
    throw new Error('Usage: investment-e2e-fixture.ts create | <enable-diligence|cleanup> <state-file>')
  }
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const email = `investment-e2e-${suffix}@example.invalid`
  const password = `E2E-${randomUUID()}!aA9`
  const submissionToken = `e2e-${randomUUID()}`

  const createdUser = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { accepted_license_at: new Date().toISOString(), e2e: true },
  })
  if (createdUser.error || !createdUser.data.user) {
    throw new Error(`Unable to create E2E user: ${createdUser.error?.message ?? 'unknown error'}`)
  }
  const userId = createdUser.data.user.id
  let fundId: string | null = null

  try {
    const fundResult = await admin
      .from('funds')
      .insert({ name: `Investment E2E ${suffix}`, created_by: userId })
      .select('id')
      .single()
    if (fundResult.error || !fundResult.data) {
      throw new Error(`Unable to create E2E fund: ${fundResult.error?.message ?? 'unknown error'}`)
    }
    fundId = fundResult.data.id as string
    const membership = await admin.from('fund_members').upsert({
      fund_id: fundId,
      user_id: userId,
      role: 'admin',
      display_name: 'Investment E2E Admin',
    }, { onConflict: 'fund_id,user_id' })
    if (membership.error) throw new Error(`Unable to create membership: ${membership.error.message}`)

    const settings: Record<string, unknown> = {
      fund_id: fundId,
      deal_intake_enabled: true,
      deal_submission_token: submissionToken,
      deal_research_enabled: true,
      deal_research_min_fit: 'weak',
      deal_thesis: 'Cardiovascular diagnostics, therapeutics, devices, and clinical workflow software with credible clinical evidence.',
      memo_agent_web_search_enabled: false,
      feature_visibility: {
        deals: 'admin',
        diligence: 'admin',
      },
    }
    const insertedSettings = await admin.from('fund_settings').insert(settings)
    if (insertedSettings.error) throw new Error(`Unable to create fund settings: ${insertedSettings.error.message}`)

    const generatedStateFile = await writeState({ suffix, email, password, userId, fundId, submissionToken })
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
      const deletedFund = await admin.from('funds').delete().eq('id', fundId)
      if (deletedFund.error) console.error(`Failed to roll back E2E fund: ${deletedFund.error.message}`)
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
