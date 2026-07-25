type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/
const INTERNAL_API_PATH_PATTERN = /^\/api\/[A-Za-z0-9][A-Za-z0-9/_-]*$/

export function backgroundJobSecret(env: RuntimeEnvironment = process.env): string {
  const value = env.BACKGROUND_JOB_TOKEN_SECRET
  if (!value) throw new Error('BACKGROUND_JOB_TOKEN_SECRET is required')
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new Error('BACKGROUND_JOB_TOKEN_SECRET must not contain control characters')
  }
  if (new TextEncoder().encode(value).byteLength < 32) {
    throw new Error('BACKGROUND_JOB_TOKEN_SECRET must contain at least 32 bytes')
  }
  return value
}

export function backgroundJobInternalOrigin(env: RuntimeEnvironment = process.env): string {
  const configured = env.BACKGROUND_JOB_INTERNAL_ORIGIN
  if (!configured) throw new Error('BACKGROUND_JOB_INTERNAL_ORIGIN is required')

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error('BACKGROUND_JOB_INTERNAL_ORIGIN must be an absolute origin')
  }

  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  const secureProtocol = url.protocol === 'https:' || (url.protocol === 'http:' && loopback)
  const exactOrigin = !url.username
    && !url.password
    && url.pathname === '/'
    && !url.search
    && !url.hash

  if (!secureProtocol || !exactOrigin) {
    throw new Error('BACKGROUND_JOB_INTERNAL_ORIGIN must be an exact HTTPS origin or loopback HTTP origin')
  }

  return url.origin
}

export function backgroundJobInternalUrl(
  path: string,
  env: RuntimeEnvironment = process.env,
): string {
  if (!INTERNAL_API_PATH_PATTERN.test(path) || path.includes('//')) {
    throw new Error('Invalid internal API path')
  }
  return `${backgroundJobInternalOrigin(env)}${path}`
}
