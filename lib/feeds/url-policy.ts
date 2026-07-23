function parseHttpUrl(input: string, { addDefaultScheme }: { addDefaultScheme: boolean }): URL {
  const value = input.trim()
  if (!value) throw new Error('URL is required')
  if (value.length > 4096) throw new Error('URL is too long')
  const candidate = addDefaultScheme && !/^[a-z][a-z0-9+.-]*:/i.test(value)
    ? `https://${value}`
    : value

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error('URL must be a valid HTTP(S) URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must use HTTP or HTTPS')
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL credentials are not allowed')
  }
  return parsed
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d+$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some(value => value < 0 || value > 255)) return true
  const [a, b] = octets
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (isPrivateIpv4(host)) return true
  const mapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (mapped) {
    const high = Number.parseInt(mapped[1], 16)
    const low = Number.parseInt(mapped[2], 16)
    return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
  }
  if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb') || host.startsWith('ff')) return true
  return false
}

export function normalizeMinifluxBaseUrl(input: string): string {
  const parsed = parseHttpUrl(input, { addDefaultScheme: false })
  const allowInsecureDev = process.env.NODE_ENV !== 'production'
    && process.env.MINIFLUX_ALLOW_INSECURE_HTTP === 'true'
  if (parsed.protocol !== 'https:' && !allowInsecureDev) {
    throw new Error('Miniflux base URL must use HTTPS')
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

export function normalizeDiscoveryUrl(input: string): string {
  const parsed = parseHttpUrl(input, { addDefaultScheme: true })
  if (isPrivateHost(parsed.hostname)) {
    throw new Error('Discovery URL must use a public host; private or local addresses are not allowed')
  }
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, parsed.pathname === '/' && !parsed.search ? '' : '/')
}

export async function assertPublicDiscoveryUrl(
  input: string,
  resolver: HostResolver = hostname => lookup(hostname, { all: true, verbatim: true }),
): Promise<string> {
  const normalized = normalizeDiscoveryUrl(input)
  const hostname = new URL(normalized).hostname.replace(/^\[|\]$/g, '')
  if (/^\d+(?:\.\d+){3}$/.test(hostname) || hostname.includes(':')) return normalized
  let answers: readonly { address: string; family: number }[]
  try {
    answers = await resolver(hostname)
  } catch {
    throw new Error('Discovery host could not be resolved to a public address')
  }
  if (!answers.length || answers.some(answer => isPrivateHost(answer.address))) {
    throw new Error('Discovery host must resolve only to public addresses')
  }
  return normalized
}

export function safeExternalHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = parseHttpUrl(value, { addDefaultScheme: false })
    if (isPrivateHost(parsed.hostname)) return null
    const normalized = parsed.toString()
    return parsed.pathname === '/' && !parsed.search && !parsed.hash
      ? normalized.replace(/\/$/, '')
      : normalized
  } catch {
    return null
  }
}
import { lookup } from 'node:dns/promises'

export type HostResolver = (hostname: string) => Promise<readonly { address: string; family: number }[]>
