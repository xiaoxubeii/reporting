import { parse } from 'tldts'

/** True only for a syntactically valid hostname under an ICANN public suffix. */
export function isPublicSearchHostname(hostname: string): boolean {
  if (!hostname.includes('.') || hostname.length > 253 || !/^[a-z0-9.-]+$/.test(hostname)) return false
  if (hostname.split('.').some(label => (
    label.length === 0 || label.length > 63 || label.startsWith('-') || label.endsWith('-')
  ))) return false
  if (isSpecialUseHostname(hostname)) return false
  const result = parse(hostname, { allowPrivateDomains: false })
  return result.isIcann === true && result.isIp === false && typeof result.domain === 'string'
}

function isSpecialUseHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true
  if (hostname === 'example.com' || hostname.endsWith('.example.com')) return true
  if (hostname === 'example.net' || hostname.endsWith('.example.net')) return true
  if (hostname === 'example.org' || hostname.endsWith('.example.org')) return true
  return ['.arpa', '.onion', '.local', '.internal', '.invalid', '.test', '.example', '.alt']
    .some(suffix => hostname.endsWith(suffix))
}
