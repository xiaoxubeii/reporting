import { spawn } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

interface FixtureCommandResult {
  readonly stateFile: string
}

interface FixtureLifecycleRecord {
  readonly kind: string
  readonly userId?: string
  readonly fundId?: string
  readonly role?: string
  readonly resourceIds: readonly string[]
  cleanup: 'pending' | 'passed' | 'failed'
  cleanupError?: string
}

async function fixtureRecord(stateFile: string): Promise<FixtureLifecycleRecord> {
  const state = JSON.parse(await readFile(stateFile, 'utf8')) as Record<string, unknown>
  const resourceIds = ['userId', 'fundId', 'lpAccountId', 'lpInvestorId']
    .map(key => state[key])
    .filter((value): value is string => typeof value === 'string')
  return {
    kind: typeof state.kind === 'string' ? state.kind : 'fund',
    userId: typeof state.userId === 'string' ? state.userId : undefined,
    fundId: typeof state.fundId === 'string' ? state.fundId : undefined,
    role: typeof state.role === 'string' ? state.role : undefined,
    resourceIds,
    cleanup: 'pending',
  }
}

async function writeLifecycleReport(
  records: readonly FixtureLifecycleRecord[],
  setup: 'running' | 'passed' | 'failed',
) {
  const target = process.env.E2E_FIXTURE_REPORT_PATH
  if (!target) return
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify({
    schemaVersion: 1,
    runId: process.env.E2E_RUN_ID ?? null,
    setup,
    fixtures: records,
  }, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, target)
}

function runFixture(args: readonly string[]): Promise<string> {
  const executable = path.join(process.cwd(), 'node_modules', '.bin', 'vite-node')
  const script = path.join(process.cwd(), 'scripts', 'investment-e2e-fixture.ts')
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [script, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr.trim() || `fixture command exited with ${code}`))
    })
  })
}

async function createFixture(
  action: 'create' | 'create-user' | 'create-lp' | 'create-member' = 'create',
  targetStateFile?: string,
  role?: 'member' | 'viewer',
): Promise<string> {
  const output = await runFixture([
    action,
    ...(targetStateFile ? [targetStateFile] : []),
    ...(role ? [role] : []),
  ])
  const result = JSON.parse(output) as Partial<FixtureCommandResult>
  if (!result.stateFile) throw new Error('Fixture command did not return a state file')
  return result.stateFile
}

export default async function globalSetup() {
  const stateFiles: string[] = []
  const records: FixtureLifecycleRecord[] = []
  const register = async (stateFile: string) => {
    stateFiles.push(stateFile)
    records.push(await fixtureRecord(stateFile))
    await writeLifecycleReport(records, 'running')
  }
  try {
    const primary = await createFixture()
    await register(primary)
    const lp = await createFixture('create-lp', primary)
    await register(lp)
    const member = await createFixture('create-member', primary, 'member')
    await register(member)
    const viewer = await createFixture('create-member', primary, 'viewer')
    await register(viewer)
    const secondary = await createFixture()
    await register(secondary)
    const onboarding = await createFixture('create-user')
    await register(onboarding)
    process.env.E2E_PRIMARY_FIXTURE_STATE = primary
    process.env.E2E_LP_FIXTURE_STATE = lp
    process.env.E2E_MEMBER_FIXTURE_STATE = member
    process.env.E2E_VIEWER_FIXTURE_STATE = viewer
    process.env.E2E_SECONDARY_FIXTURE_STATE = secondary
    process.env.E2E_ONBOARDING_FIXTURE_STATE = onboarding
    await writeLifecycleReport(records, 'passed')
  } catch (error) {
    const results = await Promise.allSettled(stateFiles.map(stateFile => runFixture(['cleanup', stateFile])))
    results.forEach((result, index) => {
      records[index].cleanup = result.status === 'fulfilled' ? 'passed' : 'failed'
      if (result.status === 'rejected') records[index].cleanupError = String(result.reason).slice(0, 500)
    })
    await writeLifecycleReport(records, 'failed')
    throw error
  }

  return async () => {
    const results = await Promise.allSettled(
      stateFiles.map(stateFile => runFixture(['cleanup', stateFile])),
    )
    results.forEach((result, index) => {
      records[index].cleanup = result.status === 'fulfilled' ? 'passed' : 'failed'
      if (result.status === 'rejected') records[index].cleanupError = String(result.reason).slice(0, 500)
    })
    await writeLifecycleReport(records, 'passed')
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  }
}
