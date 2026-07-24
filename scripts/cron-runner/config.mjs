import { isIP } from 'node:net'

const jobs = [
  {
    name: 'deals-digest',
    path: '/api/cron/deals-digest',
    schedule: '0 13 * * 1',
    timezone: 'UTC',
    timeoutMs: 180_000,
  },
  {
    name: 'memo-agent-worker',
    path: '/api/cron/memo-agent-worker',
    schedule: '*/3 * * * *',
    timezone: 'UTC',
    timeoutMs: 360_000,
  },
  {
    name: 'affinity-sync',
    path: '/api/cron/affinity-sync',
    schedule: '0 * * * *',
    timezone: 'UTC',
    timeoutMs: 120_000,
  },
  {
    name: 'deal-research',
    path: '/api/cron/deal-research',
    schedule: '*/10 * * * *',
    timezone: 'UTC',
    timeoutMs: 360_000,
  },
  {
    name: 'heartbeat-backfill',
    path: '/api/cron/heartbeat-backfill',
    schedule: '0 * * * *',
    timezone: 'UTC',
    timeoutMs: 360_000,
  },
]

export const CRON_JOBS = Object.freeze(jobs.map(job => Object.freeze({ ...job })))

export function findCronJob(name) {
  return CRON_JOBS.find(job => job.name === name) ?? null
}

export function loadCronRunnerConfig(env = process.env) {
  const secret = requireSecret(env.CRON_SECRET, env.NODE_ENV)
  const baseUrl = requireBaseUrl(env)

  return Object.freeze({
    baseUrl,
    secret,
    healthHost: requireHealthHost(env.CRON_RUNNER_HEALTH_HOST),
    healthPort: readBoundedInteger(env.CRON_RUNNER_HEALTH_PORT, {
      name: 'CRON_RUNNER_HEALTH_PORT',
      fallback: 3101,
      min: 1,
      max: 65_535,
    }),
    shutdownGraceMs: readBoundedInteger(env.CRON_RUNNER_SHUTDOWN_GRACE_MS, {
      name: 'CRON_RUNNER_SHUTDOWN_GRACE_MS',
      fallback: 30_000,
      min: 100,
      max: 300_000,
    }),
    requestTimeoutMs: readOptionalBoundedInteger(env.CRON_RUNNER_REQUEST_TIMEOUT_MS, {
      name: 'CRON_RUNNER_REQUEST_TIMEOUT_MS',
      min: 1,
      max: 900_000,
    }),
  })
}

function requireSecret(rawSecret, nodeEnv) {
  if (typeof rawSecret !== 'string' || rawSecret.length === 0 || rawSecret.trim() !== rawSecret) {
    throw new Error('CRON_SECRET must be configured as a non-empty server-only value')
  }
  if (/[\u0000-\u001f\u007f]/.test(rawSecret)) {
    throw new Error('CRON_SECRET must not contain control characters')
  }
  if (nodeEnv === 'production' && rawSecret.length < 32) {
    throw new Error('CRON_SECRET must contain at least 32 characters in production')
  }
  return rawSecret
}

function requireBaseUrl(env) {
  const rawUrl = env.CRON_RUNNER_BASE_URL
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    throw new Error('CRON_RUNNER_BASE_URL must be configured')
  }

  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('CRON_RUNNER_BASE_URL must be a valid HTTP(S) origin')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('CRON_RUNNER_BASE_URL must use HTTP or HTTPS')
  }
  if (url.username || url.password) {
    throw new Error('CRON_RUNNER_BASE_URL must not contain credentials')
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CRON_RUNNER_BASE_URL must contain only an origin')
  }

  const allowInsecure = env.CRON_RUNNER_ALLOW_INSECURE_HTTP === 'true'
  const isProduction = env.NODE_ENV === 'production'
  if (url.protocol === 'http:' && isProduction && !allowInsecure) {
    throw new Error('CRON_RUNNER_BASE_URL must use HTTPS in production unless CRON_RUNNER_ALLOW_INSECURE_HTTP=true')
  }
  if (url.protocol === 'http:' && !isProduction && !isLoopback(url.hostname) && !allowInsecure) {
    throw new Error('CRON_RUNNER_BASE_URL may use HTTP only for loopback or with CRON_RUNNER_ALLOW_INSECURE_HTTP=true')
  }

  return url.origin
}

function requireHealthHost(rawHost) {
  const host = rawHost?.trim() || '0.0.0.0'
  if (host.length > 253 || /[\s/?#]/.test(host)) {
    throw new Error('CRON_RUNNER_HEALTH_HOST must be a valid host or IP address')
  }
  return host
}

function isLoopback(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (normalized === 'localhost') return true
  const ipVersion = isIP(normalized)
  if (ipVersion === 4) return normalized.startsWith('127.')
  if (ipVersion === 6) return normalized === '::1'
  return false
}

function readOptionalBoundedInteger(rawValue, options) {
  if (rawValue === undefined || rawValue === '') return null
  return readBoundedInteger(rawValue, { ...options, fallback: undefined })
}

function readBoundedInteger(rawValue, { name, fallback, min, max }) {
  const value = rawValue === undefined || rawValue === '' ? fallback : Number(rawValue)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return value
}
