import { isValidFundSlug } from '@/lib/tenancy/host'

function parsePlatformOrigin(platformOrigin: string): URL | null {
  try {
    const origin = new URL(platformOrigin)
    if (
      !origin.hostname
      || origin.username
      || origin.password
      || origin.search
      || origin.hash
      || origin.pathname !== '/'
      || (origin.protocol !== 'https:' && origin.protocol !== 'http:')
    ) {
      return null
    }
    return origin
  } catch {
    return null
  }
}

function slugFromCanonicalInput(root: URL, rawInput: string): string | null {
  const candidateUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawInput)
    ? rawInput
    : `${root.protocol}//${rawInput}`

  try {
    const candidate = new URL(candidateUrl)
    const allowedPath = candidate.pathname === '/'
      || candidate.pathname === '/auth'
      || candidate.pathname === '/auth/'

    if (
      candidate.protocol !== root.protocol
      || candidate.port !== root.port
      || candidate.username
      || candidate.password
      || candidate.search
      || candidate.hash
      || !allowedPath
    ) {
      return null
    }

    const suffix = `.${root.hostname}`
    if (!candidate.hostname.endsWith(suffix)) return null

    const slug = candidate.hostname.slice(0, -suffix.length)
    return slug.includes('.') || !isValidFundSlug(slug) ? null : slug
  } catch {
    return null
  }
}

export function workspaceAuthUrlForInput(platformOrigin: string, input: string): string | null {
  const root = parsePlatformOrigin(platformOrigin)
  if (!root) return null

  const normalizedInput = input.trim().toLowerCase()
  const slug = isValidFundSlug(normalizedInput)
    ? normalizedInput
    : slugFromCanonicalInput(root, normalizedInput)
  if (!slug) return null

  const port = root.port ? `:${root.port}` : ''
  return `${root.protocol}//${slug}.${root.hostname}${port}/auth`
}
