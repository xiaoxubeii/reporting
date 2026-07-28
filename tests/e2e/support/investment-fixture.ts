import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { encrypt } from '@/lib/crypto'
import { createFundDekResolver } from '@/lib/email/fund-dek'
import { createSupabaseFundEmailCredentialStore } from '@/lib/email/fund-credentials'
import type { Database } from '@/lib/types/database'

type Admin = SupabaseClient<Database>
type SupportedProvider = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'openrouter'
type LegacyQueryError = { message: string } | null
interface LegacyChecklistSelectQuery<T> extends PromiseLike<{ data: T[] | null; error: LegacyQueryError }> {
  eq(column: string, value: unknown): LegacyChecklistSelectQuery<T>
  order(column: string, options: { ascending: boolean }): LegacyChecklistSelectQuery<T>
}
interface LegacyChecklistTable {
  select(columns: string): LegacyChecklistSelectQuery<{ id: string; kind: string; status: string }>
}

export type ExplicitInvestmentProvider = Readonly<{
  configured: true
  provider: SupportedProvider
  apiKey: string | null
  model: string
  baseUrl: string | null
}>

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])
const SUPPORTED_PROVIDERS = new Set<SupportedProvider>([
  'anthropic',
  'openai',
  'gemini',
  'ollama',
  'openrouter',
])

export function assertLocalInvestmentFixtureTarget(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    if (!LOCAL_HOSTS.has(url.hostname)) throw new Error('non-local')
    return rawUrl
  } catch {
    throw new Error('Investment E2E prerequisite writes require local Supabase')
  }
}

export function readExplicitInvestmentProvider(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ExplicitInvestmentProvider {
  const rawProvider = env.E2E_INVESTMENT_PROVIDER?.trim().toLowerCase()
  const apiKey = env.E2E_INVESTMENT_PROVIDER_API_KEY?.trim()
  const model = env.E2E_INVESTMENT_PROVIDER_MODEL?.trim()
  const rawBaseUrl = env.E2E_INVESTMENT_PROVIDER_BASE_URL?.trim()

  if (!rawProvider && !apiKey && !model && !rawBaseUrl) {
    throw new Error('E2E_INVESTMENT_PROVIDER is required for the comprehensive investment journey')
  }
  if (!rawProvider || !SUPPORTED_PROVIDERS.has(rawProvider as SupportedProvider)) {
    throw new Error('Unsupported E2E investment provider')
  }
  if (rawProvider !== 'ollama' && !apiKey) throw new Error('E2E_INVESTMENT_PROVIDER_API_KEY is required')
  if (!model) throw new Error('E2E_INVESTMENT_PROVIDER_MODEL is required')

  let baseUrl: string | null = null
  if (rawBaseUrl) {
    let parsed: URL
    try {
      parsed = new URL(rawBaseUrl)
    } catch {
      throw new Error('E2E_INVESTMENT_PROVIDER_BASE_URL must be an absolute URL')
    }
    const local = LOCAL_HOSTS.has(parsed.hostname)
    if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
      throw new Error('E2E investment provider URL must use HTTPS or localhost')
    }
    baseUrl = parsed.toString().replace(/\/$/, '')
  }
  if ((rawProvider === 'openrouter' || rawProvider === 'ollama') && !baseUrl) {
    throw new Error(`E2E_INVESTMENT_PROVIDER_BASE_URL is required for ${rawProvider}`)
  }

  return Object.freeze({
    configured: true as const,
    provider: rawProvider as SupportedProvider,
    apiKey: apiKey ?? null,
    model,
    baseUrl,
  })
}

export function createLocalInvestmentAdmin(): Admin {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!rawUrl || !serviceRole) throw new Error('Local Supabase admin environment is required')
  assertLocalInvestmentFixtureTarget(rawUrl)
  return createClient<Database>(rawUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Configure only the disposable Fund from explicit E2E credentials. It never
 * reads another Fund's settings, and no raw credential is returned or logged.
 */
export async function configureExplicitInvestmentProvider(
  admin: Admin,
  fundId: string,
  config: ExplicitInvestmentProvider,
): Promise<{ configured: true; provider: SupportedProvider }> {
  const kek = process.env.ENCRYPTION_KEY?.trim()
  if (!kek) throw new Error('ENCRYPTION_KEY is required for E2E investment provider setup')

  const fund = await admin.from('fund_settings').select('fund_id').eq('fund_id', fundId).maybeSingle()
  if (fund.error || !fund.data) throw new Error('Disposable E2E Fund settings were not found')

  const update: Database['public']['Tables']['fund_settings']['Update'] = {
    default_ai_provider: config.provider,
    memo_agent_stage_models: {},
  }
  if (config.provider === 'ollama') {
    update.ollama_base_url = config.baseUrl
    update.ollama_model = config.model
  } else {
    if (!config.apiKey) throw new Error('E2E provider credential is required')
    const resolveDek = createFundDekResolver(
      createSupabaseFundEmailCredentialStore(admin),
      fundId,
      kek,
    )
    const encryptedKey = encrypt(config.apiKey, await resolveDek())
    if (config.provider === 'anthropic') {
      update.claude_api_key_encrypted = encryptedKey
      update.claude_model = config.model
    } else if (config.provider === 'openai') {
      update.openai_api_key_encrypted = encryptedKey
      update.openai_model = config.model
    } else if (config.provider === 'gemini') {
      update.gemini_api_key_encrypted = encryptedKey
      update.gemini_model = config.model
    } else {
      update.openrouter_api_key_encrypted = encryptedKey
      update.openrouter_model = config.model
      update.openrouter_base_url = config.baseUrl
      update.openrouter_request_parameters = {}
    }
  }

  const saved = await admin.from('fund_settings').update(update).eq('fund_id', fundId).select('fund_id').maybeSingle()
  if (saved.error || !saved.data) throw new Error('Could not configure the disposable E2E investment provider')
  return { configured: true, provider: config.provider }
}

export async function waitForBackgroundDealResearch(params: {
  admin: Admin
  fundId: string
  dealId: string
  afterJobId?: string
  expectedJobId?: string
  timeoutMs?: number
}): Promise<{ id: string; status: string; error: string | null; attempts: number }> {
  const deadline = Date.now() + (params.timeoutMs ?? 360_000)
  let lastObservedJobs: Array<{ id: string; status: string; error: string | null; attempts: number }> = []
  while (Date.now() < deadline) {
    const result = await params.admin
      .from('background_jobs')
      .select('id, status, last_error, attempts, created_at')
      .eq('fund_id', params.fundId)
      .eq('kind', 'deal_research')
      .eq('dedupe_key', `deal_research:${params.dealId}`)
      .order('created_at', { ascending: false })
      .limit(5)
    if (result.error) throw new Error(result.error.message)
    lastObservedJobs = (result.data ?? []).map(row => ({
      id: row.id,
      status: row.status,
      error: row.last_error,
      attempts: row.attempts,
    }))
    const job = (result.data ?? []).find(row => (
      params.expectedJobId ? row.id === params.expectedJobId : row.id !== params.afterJobId
    ))
    if (job && ['completed', 'failed', 'cancelled'].includes(job.status)) {
      return { id: job.id, status: job.status, error: job.last_error, attempts: job.attempts }
    }
    await driveLocalCron('/api/cron/background-jobs')
    await delay(2_000)
  }
  throw new Error(
    `Timed out waiting for terminal Deal Research background job; observed=${JSON.stringify(lastObservedJobs)}`,
  )
}

export async function waitForMemoAgentIdle(params: {
  admin: Admin
  fundId: string
  dealId: string
  expectedKind?: string
  afterJobId?: string
  timeoutMs?: number
}): Promise<{ id: string; kind: string; status: string; error: string | null }> {
  const deadline = Date.now() + (params.timeoutMs ?? 480_000)
  let expectedSeen = false
  while (Date.now() < deadline) {
    await driveLocalCron('/api/cron/memo-agent-worker')
    const jobs = await params.admin
      .from('memo_agent_jobs')
      .select('id, kind, status, error, enqueued_at')
      .eq('fund_id', params.fundId)
      .eq('deal_id', params.dealId)
      .order('enqueued_at', { ascending: false })
      .limit(30)
    if (jobs.error) throw new Error(jobs.error.message)
    const rows = (jobs.data ?? []).filter(row => row.id !== params.afterJobId)
    if (params.expectedKind) expectedSeen ||= rows.some(row => row.kind === params.expectedKind)
    else expectedSeen = rows.length > 0
    const active = rows.some(row => row.status === 'pending' || row.status === 'running')
    const latestExpected = params.expectedKind
      ? rows.find(row => row.kind === params.expectedKind)
      : rows[0]
    if (expectedSeen && !active && latestExpected && ['success', 'failed', 'cancelled'].includes(latestExpected.status)) {
      return {
        id: latestExpected.id,
        kind: latestExpected.kind,
        status: latestExpected.status,
        error: latestExpected.error,
      }
    }
    await delay(2_000)
  }
  throw new Error(`Timed out waiting for Memo Agent${params.expectedKind ? ` ${params.expectedKind}` : ''}`)
}

async function driveLocalCron(pathname: '/api/cron/background-jobs' | '/api/cron/memo-agent-worker'): Promise<void> {
  const baseUrl = process.env.E2E_BASE_URL?.trim()
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!baseUrl || !cronSecret) throw new Error('E2E cron driver requires E2E_BASE_URL and CRON_SECRET')
  const url = new URL(pathname, baseUrl)
  if (!LOCAL_HOSTS.has(url.hostname)) throw new Error('E2E cron driver requires a local application origin')
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${cronSecret}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(360_000),
  })
  if (!response.ok) {
    throw new Error(`E2E cron driver ${pathname} returned HTTP ${response.status}`)
  }
}

export async function readInvestmentChecklistGapCount(
  admin: Admin,
  fundId: string,
  dealId: string,
): Promise<{ total: number; unresolved: number }> {
  const result = await legacyChecklist(admin)
    .select('id, kind, status')
    .eq('fund_id', fundId)
    .eq('deal_id', dealId)
  if (result.error) throw new Error(result.error.message)
  const items = (result.data ?? []).filter(row => row.kind === 'item')
  return {
    total: items.length,
    unresolved: items.filter(row => row.status === 'missing' || row.status === 'partial').length,
  }
}

function legacyChecklist(admin: Admin): LegacyChecklistTable {
  return (admin as unknown as { from(relation: string): LegacyChecklistTable })
    .from('diligence_checklist_items')
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
