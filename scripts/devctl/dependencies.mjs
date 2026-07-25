const DEPENDENCY_CONFIG = Object.freeze({
  miniflux: Object.freeze({ envKey: 'MINIFLUX_BASE_URL', healthPath: 'healthcheck', healthy: status => status === 200 }),
  searxng: Object.freeze({ envKey: 'REPORTING_SEARXNG_URL', healthPath: 'healthz', healthy: status => status === 200 }),
  supabase: Object.freeze({ envKey: 'NEXT_PUBLIC_SUPABASE_URL', healthPath: 'auth/v1/health', healthy: status => status < 500 }),
})

export const EXTERNAL_DEPENDENCY_NAMES = Object.freeze(Object.keys(DEPENDENCY_CONFIG))

export async function probeExternalDependencies(env, options = {}) {
  const statuses = await Promise.all(EXTERNAL_DEPENDENCY_NAMES.map(async name => {
    const config = DEPENDENCY_CONFIG[name]
    const status = await probeExternalDependency(env[config.envKey], config, options)
    return Object.freeze({ name, ...status })
  }))
  return Object.freeze(statuses)
}

export function createExternalDependencyProbes(env, options = {}) {
  return Object.freeze(Object.fromEntries(
    EXTERNAL_DEPENDENCY_NAMES.map(name => [
      name,
      async () => {
        const config = DEPENDENCY_CONFIG[name]
        return probeExternalDependency(env[config.envKey], config, options)
      },
    ]),
  ))
}

export async function probeExternalDependency(rawValue, config, options = {}) {
  const rawUrl = rawValue?.trim()
  if (!rawUrl) return Object.freeze({ state: 'unconfigured', ownership: 'external' })
  const url = safeEndpoint(rawUrl)
  if (!url) return Object.freeze({ state: 'invalid', ownership: 'external' })
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 1_500
  try {
    const response = await fetchImpl(new URL(config.healthPath, directoryUrl(url)), {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    })
    return Object.freeze({
      state: config.healthy(response.status) ? 'running' : 'degraded',
      ownership: 'external',
      url: url.origin,
    })
  } catch {
    return Object.freeze({ state: 'unreachable', ownership: 'external', url: url.origin })
  }
}

function directoryUrl(url) {
  const base = new URL(url.href)
  if (!base.pathname.endsWith('/')) base.pathname = `${base.pathname}/`
  return base
}

function safeEndpoint(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

function isLoopbackHost(hostname) {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost'
    || normalized === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized)
}
