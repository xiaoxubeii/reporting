import { withBotId } from 'botid/next/config'
import { lstatSync } from 'node:fs'
import { isIP } from 'node:net'
import path from 'node:path'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

function isSafeCspHostname(hostname) {
  const unwrapped = hostname.replace(/^\[|\]$/g, '')
  if (isIP(unwrapped)) return true
  if (hostname.length > 253) return false
  return hostname.split('.').every(label => (
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ))
}

function isLoopbackHostname(hostname) {
  const unwrapped = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (unwrapped === 'localhost' || unwrapped === '::1') return true
  if (isIP(unwrapped) !== 4) return false
  return unwrapped.split('.')[0] === '127'
}

function safeSupabaseOrigin(rawUrl) {
  if (!rawUrl || /[\s*;]/.test(rawUrl)) return null

  try {
    const url = new URL(rawUrl)
    if (url.username || url.password || !isSafeCspHostname(url.hostname)) return null
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.protocol === 'http:' && (
      process.env.NODE_ENV === 'production'
      || !isLoopbackHostname(url.hostname)
    )) return null
    return url.origin
  } catch {
    return null
  }
}

export function supabaseConnectSources(rawUrl) {
  const origin = safeSupabaseOrigin(rawUrl)
  if (!origin) return []

  const url = new URL(origin)
  const websocketProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return [origin, `${websocketProtocol}//${url.host}`]
}

function isDevelopmentSupabaseProxyEnabled() {
  const browserUrl = process.env.NEXT_PUBLIC_SUPABASE_BROWSER_URL?.trim().replace(/\/+$/, '')
  return process.env.NODE_ENV !== 'production' && browserUrl === '/_supabase'
}

export function nextDistDir(rawValue, rootDir = process.cwd()) {
  const value = rawValue?.trim()
  if (!value) return '.next'
  if (value !== '.next' && value !== '.next-devctl') {
    throw new Error('NEXT_DIST_DIR must be a safe directory name')
  }
  const existing = lstatSync(path.resolve(rootDir, value), { throwIfNoEntry: false })
  if (existing?.isSymbolicLink()) {
    throw new Error('NEXT_DIST_DIR must not be a symbolic link')
  }
  return value
}

export function nextTsconfigPath(distDir) {
  return distDir === '.next-devctl' ? 'tsconfig.devctl.json' : 'tsconfig.json'
}

const distDir = nextDistDir(process.env.NEXT_DIST_DIR)

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir,
  typescript: {
    tsconfigPath: nextTsconfigPath(distDir),
  },
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
    // Include the memo-agent default schema files in the serverless function
    // bundle. Without this, `fs.readFile` calls inside `ensureDefaults` silently
    // return null in production (the YAML/MD files aren't traced), so a fresh
    // fund sees every schema marked "not yet seeded" and the schema editor loads
    // empty content. The trace is keyed `/**` so every route that imports
    // firm-schemas.ts gets the files — schemas page, agent stages, render job.
    //
    // NOTE: on Next 14 this must live under `experimental`. It became a
    // top-level config key in Next 15 — move it out when upgrading.
    outputFileTracingIncludes: {
      '/**': ['./lib/memo-agent/defaults/**/*'],
    },
  },
  // OAuth discovery lives at /.well-known/*, but Next's app router will not route
  // a literal dot-prefixed directory — so the well-known paths are rewritten onto
  // real routes under /api/oauth/metadata/.
  //
  // The path-suffixed variants matter: RFC 9728 says a client MAY probe
  // /.well-known/oauth-protected-resource/<resource-path>, and Claude does exactly
  // that for /api/mcp. Serving only the bare path would leave discovery failing
  // for no visible reason.
  async rewrites() {
    const supabaseOrigin = isDevelopmentSupabaseProxyEnabled()
      ? safeSupabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL)
      : null
    return [
      ...(supabaseOrigin ? [{
        source: '/_supabase/:path*',
        destination: `${supabaseOrigin}/:path*`,
      }] : []),
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/oauth/metadata/authorization-server',
      },
      {
        source: '/.well-known/oauth-authorization-server/:path*',
        destination: '/api/oauth/metadata/authorization-server',
      },
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/oauth/metadata/protected-resource',
      },
      {
        source: '/.well-known/oauth-protected-resource/:path*',
        destination: '/api/oauth/metadata/protected-resource',
      },
    ]
  },
  async headers() {
    const connectSources = [
      "'self'",
      ...supabaseConnectSources(process.env.NEXT_PUBLIC_SUPABASE_URL),
      'https://cdn.usefathom.com',
      'https://www.google-analytics.com',
      'https://api.github.com',
      'https://calendly.com',
    ]
    const contentSecurityPolicy = (frameAncestors) => (
      `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.usefathom.com https://www.googletagmanager.com https://www.google-analytics.com https://assets.calendly.com; style-src 'self' 'unsafe-inline' https://assets.calendly.com; img-src 'self' data: blob: https:; font-src 'self'; connect-src ${connectSources.join(' ')}; frame-src 'self' https://calendly.com; frame-ancestors ${frameAncestors}; object-src 'none'; base-uri 'self'`
    )
    const sharedSecurityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ]
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      ...sharedSecurityHeaders,
      {
        key: 'Content-Security-Policy',
        value: contentSecurityPolicy("'none'"),
      },
    ]
    const previewSecurityHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      ...sharedSecurityHeaders,
      { key: 'Content-Security-Policy', value: contentSecurityPolicy("'self'") },
    ]

    const noCacheHeaders = [
      { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
      { key: 'CDN-Cache-Control', value: 'no-store' },
      { key: 'Netlify-CDN-Cache-Control', value: 'no-store' },
    ]

    return [
      // Security headers for pages and API routes only — exclude _next/static
      // so Netlify CDN can serve JS/CSS chunks directly without interference.
      {
        source: '/((?!_next/static|fund-public-site-preview).*)',
        headers: securityHeaders,
      },
      // The private draft renderer is the only page designed for same-origin
      // framing. Authentication and Host/Fund checks still run on the route.
      {
        source: '/fund-public-site-preview',
        headers: previewSecurityHeaders,
      },
      // Prevent caching on auth and demo routes
      { source: '/auth/:path*', headers: noCacheHeaders },
      { source: '/_supabase/auth/v1/:path*', headers: noCacheHeaders },
      { source: '/demo', headers: noCacheHeaders },
      { source: '/api/auth/:path*', headers: noCacheHeaders },
      { source: '/api/demo/:path*', headers: noCacheHeaders },
    ]
  },
}
export default withBotId(withNextIntl(nextConfig))
