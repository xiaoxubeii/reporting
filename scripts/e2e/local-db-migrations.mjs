import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])
const CONTAINER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/

export const REQUIRED_E2E_MIGRATIONS = Object.freeze([
  '20260727010000_atomic_deal_promotion.sql',
  '20260727020000_diligence_decision_integrity.sql',
  '20260727030000_feed_discovery_ollama_scheduler.sql',
])

export function assertLocalMigrationTarget(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Comprehensive E2E migrations require a valid Supabase URL')
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('Comprehensive E2E migrations may only target local Supabase')
  }
  return url.origin
}

export function validateDatabaseContainer(rawContainer) {
  const container = rawContainer.trim()
  if (!CONTAINER_PATTERN.test(container)) {
    throw new Error('E2E Supabase database container name is invalid')
  }
  return container
}

export async function applyRequiredLocalMigrations({
  rootDirectory,
  supabaseUrl,
  container = process.env.E2E_SUPABASE_DB_CONTAINER ?? 'supabase-db',
}) {
  assertLocalMigrationTarget(supabaseUrl)
  const databaseContainer = validateDatabaseContainer(container)
  const statements = await Promise.all(REQUIRED_E2E_MIGRATIONS.map(file => (
    readFile(path.join(rootDirectory, 'supabase', 'migrations', file), 'utf8')
  )))
  const sql = ['begin;', ...statements, "notify pgrst, 'reload schema';", 'commit;', ''].join('\n')

  await new Promise((resolve, reject) => {
    const child = spawn('docker', [
      'exec', '-i', databaseContainer,
      'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/dev/stdin',
    ], { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `Local E2E migration apply exited with ${code}`))
    })
    child.stdin.end(sql)
  })
}
