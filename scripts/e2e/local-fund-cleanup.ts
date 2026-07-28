import { spawn } from 'node:child_process'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONTAINER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/
const FUND_NAME_PATTERN = /^Investment E2E \d{13}-[0-9a-f]{8}$/
const FUND_SLUG_PATTERN = /^e2e-\d{13}-[0-9a-f]{8}$/

export function validateLocalDatabaseContainer(value: string): string {
  const container = value.trim()
  if (!CONTAINER_PATTERN.test(container)) {
    throw new Error('E2E Supabase database container name is invalid')
  }
  return container
}

export function buildLocalFundCleanupSql(
  fundId: string,
  fundName: string,
  fundSlug: string,
): string {
  if (!UUID_PATTERN.test(fundId)) throw new Error('E2E Fund id must be a valid UUID')
  if (!FUND_NAME_PATTERN.test(fundName)) throw new Error('E2E Fund name is invalid')
  if (!FUND_SLUG_PATTERN.test(fundSlug)) throw new Error('E2E Fund slug is invalid')
  return [
    'begin;',
    'alter table public.funds disable trigger fund_identity_delete_forbidden;',
    'do $$ declare deleted_count integer; begin',
    `delete from public.funds where id = '${fundId}'::uuid`,
    `  and name = '${fundName}'`,
    `  and slug = '${fundSlug}'`,
    `  and email_subdomain = '${fundSlug}';`,
    'get diagnostics deleted_count = row_count;',
    `if deleted_count <> 1 then raise exception 'E2E Fund identity mismatch'; end if;`,
    'end $$;',
    'alter table public.funds enable trigger fund_identity_delete_forbidden;',
    'commit;',
    '',
  ].join('\n')
}

export async function forceDeleteLocalFundIdentity(params: {
  fundId: string
  fundName: string
  fundSlug: string
  supabaseUrl: string
  container?: string
}): Promise<void> {
  const hostname = new URL(params.supabaseUrl).hostname
  if (!['127.0.0.1', 'localhost'].includes(hostname)) {
    throw new Error('Forced E2E Fund cleanup may only target local Supabase')
  }
  const container = validateLocalDatabaseContainer(
    params.container ?? process.env.E2E_SUPABASE_DB_CONTAINER ?? 'supabase-db',
  )
  const sql = buildLocalFundCleanupSql(params.fundId, params.fundName, params.fundSlug)

  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', [
      'exec', '-i', container,
      'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/dev/stdin',
    ], {
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `Local E2E Fund cleanup exited with ${code}`))
    })
    child.stdin.end(sql)
  })
}
