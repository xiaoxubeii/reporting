import { constants } from 'node:fs'
import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

import { probeExternalDependencies } from '../devctl/dependencies.mjs'
import { processIdentityMatches, readState } from '../devctl/runtime.mjs'

const REQUIRED_EXTERNAL_DEPENDENCIES = Object.freeze(['supabase', 'miniflux', 'searxng'])
const AI_ENV_KEYS = Object.freeze([
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GEMINI_API_KEY',
  'CUSTOM_OPENAI_API_KEY',
])
const PLATFORM_MAIL_ENV_KEYS = Object.freeze(['RESEND_API_KEY', 'SYSTEM_EMAIL_FROM'])
const DISCOVERY_PROVIDER_ENV_KEYS = Object.freeze([
  'E2E_INVESTMENT_PROVIDER',
  'E2E_INVESTMENT_PROVIDER_API_KEY',
  'E2E_INVESTMENT_PROVIDER_MODEL',
  'E2E_INVESTMENT_PROVIDER_BASE_URL',
])
const DISCOVERY_PROVIDERS = new Set(['anthropic', 'openai', 'gemini', 'ollama', 'openrouter'])

function configured(env, keys) {
  return keys.some(key => typeof env[key] === 'string' && env[key].trim().length > 0)
}

function allConfigured(env, keys) {
  return keys.every(key => typeof env[key] === 'string' && env[key].trim().length > 0)
}

export function readPlatformMailCapability(env) {
  const state = allConfigured(env, PLATFORM_MAIL_ENV_KEYS) ? 'configured' : 'unconfigured'
  const optedIn = env.E2E_ALLOW_REAL_MAIL_DELIVERY?.trim().toLowerCase() === 'true'
  return Object.freeze({
    state,
    delivery: state === 'configured' && optedIn ? 'enabled' : 'disabled',
  })
}

export function readDiscoveryProviderCapability(env) {
  const anyExplicitValue = configured(env, DISCOVERY_PROVIDER_ENV_KEYS)
  if (!anyExplicitValue) return Object.freeze({ state: 'unconfigured', provider: null })

  const provider = env.E2E_INVESTMENT_PROVIDER?.trim().toLowerCase() ?? ''
  const hasApiKey = configured(env, ['E2E_INVESTMENT_PROVIDER_API_KEY'])
  const hasModel = configured(env, ['E2E_INVESTMENT_PROVIDER_MODEL'])
  const hasBaseUrl = configured(env, ['E2E_INVESTMENT_PROVIDER_BASE_URL'])
  const valid = DISCOVERY_PROVIDERS.has(provider)
    && (provider === 'ollama' || hasApiKey)
    && hasModel
    && (!['openrouter', 'ollama'].includes(provider) || hasBaseUrl)
  return Object.freeze({
    state: valid ? 'configured' : 'invalid',
    provider: DISCOVERY_PROVIDERS.has(provider) ? provider : null,
  })
}

export function readFundMailRoundTripCapability(env) {
  const keys = [
    'RESEND_BASE_URL',
    'E2E_RESEND_API_KEY',
    'E2E_RESEND_CONTROL_URL',
    'E2E_RESEND_CONTROL_TOKEN',
  ]
  if (!configured(env, keys)) return Object.freeze({ state: 'unconfigured', provider: null })
  if (!allConfigured(env, keys)) return Object.freeze({ state: 'invalid', provider: null })
  try {
    const baseUrl = new URL(env.RESEND_BASE_URL.trim())
    const controlUrl = new URL(env.E2E_RESEND_CONTROL_URL.trim())
    const local = ['127.0.0.1', 'localhost'].includes(baseUrl.hostname)
    const valid = local
      && baseUrl.protocol === 'http:'
      && controlUrl.origin === baseUrl.origin
      && controlUrl.pathname.startsWith('/__e2e')
    return Object.freeze({
      state: valid ? 'configured' : 'invalid',
      provider: valid ? 'resend-local' : null,
    })
  } catch {
    return Object.freeze({ state: 'invalid', provider: null })
  }
}

async function readableFile(rawPath) {
  if (!rawPath?.trim()) return false
  try {
    await access(path.resolve(rawPath.trim()), constants.R_OK)
    return true
  } catch {
    return false
  }
}

export function browserExecutableCandidates(env, bundledExecutable = chromium.executablePath()) {
  const configuredExecutable = env.E2E_CHROMIUM_EXECUTABLE?.trim()
  return Object.freeze([
    ...(configuredExecutable ? [configuredExecutable] : []),
    bundledExecutable,
  ].filter(Boolean))
}

async function browserCapability(env) {
  const candidates = browserExecutableCandidates(env)
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK)
      return Object.freeze({ state: 'running', source: path.basename(candidate) })
    } catch {
      // Continue through the bounded candidate list.
    }
  }
  return Object.freeze({ state: 'unavailable' })
}

export async function collectE2ECapabilities({ env, runtimeDirectory }) {
  const [runtime, external, browser, minifluxProvisioner] = await Promise.all([
    readState(runtimeDirectory),
    probeExternalDependencies(env, { timeoutMs: 3_000 }),
    browserCapability(env),
    readableFile(env.MINIFLUX_PROVISIONER_TOKEN_FILE),
  ])

  const services = {}
  for (const name of ['web', 'cron']) {
    const record = runtime?.services?.[name]
    services[name] = Object.freeze({
      state: record && await processIdentityMatches(record) ? 'running' : 'stopped',
      port: runtime?.ports?.[name] ?? null,
    })
  }

  const platformMail = readPlatformMailCapability(env)
  const investmentAi = readDiscoveryProviderCapability(env)
  const fundMailRoundTrip = readFundMailRoundTripCapability(env)
  return Object.freeze({
    generatedAt: new Date().toISOString(),
    services: Object.freeze(services),
    external: Object.freeze(Object.fromEntries(external.map(item => [item.name, item]))),
    credentials: Object.freeze({
      supabaseServiceRole: configured(env, ['SUPABASE_SERVICE_ROLE_KEY']),
      minifluxProvisioner,
    }),
    providers: Object.freeze({
      ai: configured(env, AI_ENV_KEYS) ? 'configured' : 'unconfigured',
      investmentAi,
      discoveryAi: investmentAi,
      platformMail: platformMail.state,
      platformMailDelivery: platformMail.delivery,
      fundMailEncryption: configured(env, ['FUND_EMAIL_MASTER_KEY']) ? 'configured' : 'unconfigured',
      fundMailRoundTrip,
    }),
    browser,
  })
}

export function assertRequiredE2ECapabilities(capabilities) {
  const failures = []
  for (const name of ['web', 'cron']) {
    if (capabilities.services?.[name]?.state !== 'running') failures.push(`${name}:not-running`)
  }
  for (const name of REQUIRED_EXTERNAL_DEPENDENCIES) {
    if (capabilities.external?.[name]?.state !== 'running') {
      failures.push(`${name}:${capabilities.external?.[name]?.state ?? 'missing'}`)
    }
  }
  if (!capabilities.credentials?.supabaseServiceRole) failures.push('supabase-service-role:missing')
  if (!capabilities.credentials?.minifluxProvisioner) failures.push('miniflux-provisioner:missing')
  if (capabilities.browser?.state !== 'running') failures.push('browser:unavailable')
  if (capabilities.providers?.investmentAi?.state !== 'configured') {
    failures.push(`investment-ai:${capabilities.providers?.investmentAi?.state ?? 'missing'}`)
  }
  if (capabilities.providers?.fundMailRoundTrip?.state !== 'configured') {
    failures.push(`fund-mail-round-trip:${capabilities.providers?.fundMailRoundTrip?.state ?? 'missing'}`)
  }
  if (capabilities.providers?.discoveryAi?.state === 'invalid') failures.push('discovery-ai:invalid')
  if (failures.length > 0) {
    throw new Error(`Required E2E capabilities are unavailable: ${failures.join(', ')}`)
  }
}

export async function writeE2ECapabilityReport(capabilities, target) {
  const absoluteTarget = path.resolve(target)
  await mkdir(path.dirname(absoluteTarget), { recursive: true })
  const temporary = `${absoluteTarget}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(capabilities, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, absoluteTarget)
  return absoluteTarget
}
