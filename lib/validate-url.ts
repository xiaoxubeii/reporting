import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { Address4, Address6 } from 'ip-address'

type ValidationResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Validates an Ollama base URL to prevent SSRF attacks.
 *
 * Allows:
 * - localhost / 127.0.0.1 / ::1 (standard Ollama setup)
 * - Public IPs and hostnames
 *
 * Blocks:
 * - Cloud metadata endpoints (169.254.x.x)
 * - Private network ranges (10.x, 172.16-31.x, 192.168.x) except localhost
 * - Non-HTTP(S) protocols
 * - URLs without a valid hostname
 */
export function validateOllamaUrl(input: string): ValidationResult {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return { ok: false, error: 'Invalid URL format' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only HTTP and HTTPS URLs are allowed' }
  }

  const hostname = parsed.hostname

  if (!hostname) {
    return { ok: false, error: 'URL must include a hostname' }
  }

  // Allow localhost variants (standard Ollama setup)
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return { ok: true, url: input }
  }

  // Block link-local / cloud metadata (169.254.x.x — includes AWS/GCP/Azure metadata at 169.254.169.254)
  if (/^169\.254\./.test(hostname)) {
    return { ok: false, error: 'Link-local addresses are not allowed' }
  }

  // Block private network ranges
  if (/^10\./.test(hostname)) {
    return { ok: false, error: 'Private network addresses are not allowed' }
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) {
    return { ok: false, error: 'Private network addresses are not allowed' }
  }
  if (/^192\.168\./.test(hostname)) {
    return { ok: false, error: 'Private network addresses are not allowed' }
  }

  // Block other loopback ranges (127.0.0.0/8 beyond 127.0.0.1)
  if (/^127\./.test(hostname)) {
    return { ok: false, error: 'Loopback addresses are not allowed' }
  }

  // Block IPv6 private/link-local (fe80::, fc00::, fd00::)
  if (/^(fe80|fc00|fd00)/i.test(hostname)) {
    return { ok: false, error: 'Private IPv6 addresses are not allowed' }
  }

  // Block 0.0.0.0
  if (hostname === '0.0.0.0') {
    return { ok: false, error: 'Invalid address' }
  }

  return { ok: true, url: input }
}

/**
 * Custom hosted providers are server-side egress targets. Unlike Ollama, they
 * may not point at loopback, and hostnames must resolve only to public IPs.
 */
export async function validateCustomProviderUrl(input: string): Promise<ValidationResult> {
  const basic = validateOllamaUrl(input)
  if (!basic.ok) return basic

  const parsed = new URL(basic.url)
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'Custom provider Base URL must use HTTPS' }
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Credentials are not allowed in the Base URL' }
  }
  if (parsed.search || parsed.hash) {
    return { ok: false, error: 'Query parameters and fragments are not allowed in the Base URL' }
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return { ok: false, error: 'Local addresses are not allowed for custom providers' }
  }

  let addresses: string[]
  if (isIP(hostname)) {
    addresses = [hostname]
  } else {
    try {
      addresses = (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address)
    } catch {
      return { ok: false, error: 'Base URL hostname could not be resolved' }
    }
  }

  if (addresses.length === 0 || addresses.some(isNonPublicAddress)) {
    return { ok: false, error: 'Base URL must resolve only to public addresses' }
  }

  return basic
}

const NON_PUBLIC_IPV4_SUBNETS = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
].map((subnet) => new Address4(subnet))

const NON_PUBLIC_IPV6_SUBNETS = [
  '::/128',
  '::1/128',
  '64:ff9b::/96',
  '64:ff9b:1::/48',
  '100::/64',
  '2001::/23',
  '2002::/16',
  'fc00::/7',
  'fe80::/10',
  'ff00::/8',
].map((subnet) => new Address6(subnet))

const IPV4_MAPPED_IPV6_SUBNET = new Address6('::ffff:0:0/96')

export function isNonPublicAddress(rawAddress: string): boolean {
  try {
    if (isIP(rawAddress) === 4) {
      const address = new Address4(rawAddress)
      return NON_PUBLIC_IPV4_SUBNETS.some((subnet) => address.isInSubnet(subnet))
    }

    if (isIP(rawAddress) === 6) {
      const address = new Address6(rawAddress)
      if (address.isInSubnet(IPV4_MAPPED_IPV6_SUBNET)) {
        return isNonPublicAddress(address.to4().address)
      }
      return NON_PUBLIC_IPV6_SUBNETS.some((subnet) => address.isInSubnet(subnet))
    }
  } catch {
    return true
  }

  return true
}
