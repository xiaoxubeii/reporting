import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { matchRoute } from '@/lib/access/match-route'
import { ROUTE_DOMAINS, UNGATED_ROUTES, requiredLevel } from '@/lib/access/route-domains'
import { hasAccess, resolveAccessContext } from '@/lib/access/effective'
import { DOMAIN_META } from '@/lib/access/domains'
import { listBackgroundJobPolicies } from '@/lib/background-jobs/registry'
import { getSupabaseCookieOptions } from '@/lib/supabase/cookie-options'
import {
  canonicalFundRequestOrigin,
  classifyFundRequestHost,
  sanitizeTenantRequestHeaders,
} from '@/lib/tenancy/host'
import { admitFundHostRoute } from '@/lib/tenancy/route-authority'
import { resolveTenantDescriptor, type TenantDescriptor } from '@/lib/tenancy/descriptor'

const BACKGROUND_JOB_WORKER_PATHS = new Set(
  listBackgroundJobPolicies().map(policy => policy.workerPath),
)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Alternate server-to-server authentication. Presence of Authorization is
  // an exclusive mode switch: these handlers validate an exact-audience Job
  // Token and never fall back to Session. Bypass Session refresh/MFA/domain
  // middleware so a stray browser cookie cannot change that identity mode.
  const hasBackgroundAuthorization = request.method === 'POST' && request.headers.has('authorization') && (
    pathname === '/api/search' || BACKGROUND_JOB_WORKER_PATHS.has(pathname)
  )

  let hostContext
  try {
    hostContext = classifyFundRequestHost(request)
  } catch {
    return hostNotFound()
  }
  const admission = admitFundHostRoute(
    hostContext,
    pathname,
    request.method,
    hasBackgroundAuthorization,
  )
  if (!admission.allowed) return hostNotFound()

  const trustedHeaders = sanitizeTenantRequestHeaders(
    request.headers,
    hostContext.mode === 'tenant' ? hostContext.slug : undefined,
  )

  let tenant: TenantDescriptor | null = null
  if (hostContext.mode === 'tenant') {
    const tenantLookup = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: () => undefined,
        },
      },
    )
    try {
      tenant = await resolveTenantDescriptor(tenantLookup as never, hostContext.slug)
    } catch {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    if (!tenant) return hostNotFound()
  }

  let supabaseResponse = NextResponse.next({ request: { headers: trustedHeaders } })

  // Expert invitations use a fragment credential handled by the isolated page
  // and token APIs. Host admission and exact tenant resolution happen first,
  // but this public flow still never reads or writes Session cookies.
  if (pathname === '/expert-response' || pathname.startsWith('/api/public/expert-response/')) {
    return supabaseResponse
  }

  // Registered workers and webhooks authenticate inside their handlers with a
  // cron secret, Job Token, or provider credential. Their identity must remain
  // exclusive from a stray browser Session after Host admission.
  if (hasBackgroundAuthorization || admission.authority === 'worker' || admission.authority === 'webhook') {
    return supabaseResponse
  }

  const cookieOptions = getSupabaseCookieOptions()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: trustedHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Always call getUser() to refresh the session token.
  // Do not add logic between createServerClient and getUser().
  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = pathname.startsWith('/auth')
  const isApiRoute = pathname.startsWith('/api')
  const isLocalePreferenceRoute = pathname === '/api/locale'

  // Marketing site routes require both env vars to be set
  const marketingEnabled =
    process.env.NEXT_PUBLIC_ENABLE_MARKETING_SITE === 'true' &&
    !!process.env.MARKETING_DEPLOYMENT_KEY

  const isMarketingRoute = pathname === '/' || pathname === '/license' || pathname === '/demo' || pathname === '/contact' || pathname === '/terms' || pathname === '/privacy' || pathname === '/pricing' || pathname.endsWith('-explainer')
  // A Fund's published/private homepage is a tenant product surface, not the
  // FundWorkspace marketing deployment. It remains reachable for signed-out
  // and signed-in visitors even when the platform marketing flag is disabled.
  const isPublicFundHomepage = Boolean(tenant && pathname === '/')
  const isPublicMarketingRoute = isPublicFundHomepage || (marketingEnabled && isMarketingRoute)

  // Token-gated public surfaces — always reachable regardless of the marketing
  // site flag. The token in the URL is the auth: a fund admin generates it
  // in Settings and shares the resulting link with founders. The page itself
  // 404s if the token doesn't resolve or `deal_intake_enabled` is false on the
  // fund, so the URL alone isn't enough to abuse the endpoint.
  const isPublicTokenRoute = pathname.startsWith('/submit/')
    || pathname === '/expert-response'
    || pathname === '/invite'

  const isSetupRoute = pathname === '/setup' && process.env.ENABLE_SETUP_PAGE === 'true'
  const isPortalRoute = pathname.startsWith('/portal')
  const isOnboardingRoute = pathname === '/onboarding' || pathname.startsWith('/onboarding/')
  const isLpApiRoute = pathname.startsWith('/api/portal/')
  const isLpActivationApi = pathname === '/api/portal/activate'

  // OAuth discovery (RFC 8414 / RFC 9728). An MCP client fetches these BEFORE it
  // has any credential, so they must answer to an anonymous caller — bouncing them
  // to /auth would return an HTML login page where JSON metadata was expected, and
  // the connector would fail with an opaque registration error. They contain no
  // secrets: they advertise endpoints and capabilities, nothing more.
  const isOAuthDiscovery = pathname.startsWith('/.well-known/')
  // Onboarding begins before the LP has a session, so it must be reachable unauthenticated.
  const isPortalWelcome = pathname === '/portal/welcome'

  // Unauthenticated users can only access /auth, API, marketing pages (if
  // enabled), the token-gated public submit form, and setup routes.
  if (!user && !isAuthRoute && !isApiRoute && !isPublicMarketingRoute && !isPublicTokenRoute && !isSetupRoute && !isPortalWelcome && !isOAuthDiscovery) {
    const url = canonicalRedirectUrl(request)
    url.pathname = '/auth'
    // Carry where they were headed, so signing in RESUMES it.
    //
    // This used to clone the URL and only swap the pathname, which left the original
    // query string dangling on /auth as junk and set no `next` at all. That silently
    // broke the OAuth consent flow: /oauth/authorize builds its own `?next=` for exactly
    // this case, but it never gets to run — middleware intercepts first — so a signed-out
    // user connecting an agent landed on the dashboard afterwards and the app that sent
    // them never received its code.
    //
    // /auth validates this through safeNextPath (a redirect fired straight after login is
    // a phishing primitive), so an origin-relative path is all we may pass.
    const target = pathname + request.nextUrl.search
    url.search = ''
    url.searchParams.set('next', target)
    return NextResponse.redirect(url)
  }

  // Enforce MFA: redirect to verify page if user has enrolled TOTP but hasn't completed AAL2
  if (user && !isAuthRoute && !isPublicMarketingRoute && !isPublicTokenRoute && !isOAuthDiscovery && !isLocalePreferenceRoute) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      if (isApiRoute) {
        return NextResponse.json({ error: 'MFA verification required' }, { status: 403 })
      }
      const url = canonicalRedirectUrl(request)
      url.pathname = '/auth/mfa-verify'
      return NextResponse.redirect(url)
    }
  }

  // ── Per-domain access gate for the API ───────────────────────────────────
  //
  // THE choke point. Every /api request resolves to a route in lib/access/route-domains.ts and is
  // checked against the caller's grants before the handler runs.
  //
  // It lives here rather than in 263 route files because that is exactly what failed: 137 of them
  // checked only "are you in this fund" and never looked at role — not by decision, but because
  // nothing made them. A gate a route must remember to call is a gate that gets forgotten. Routes
  // keep their own helpers as defence in depth; this is the boundary.
  //
  // Reads use the caller's own session (RLS-scoped), so the edge never holds a service-role key:
  // fund_settings, fund_member_access, and fund_domain_defaults are all readable by their owner.
  if (user && isApiRoute) {
    if (tenant && isLpApiRoute && !isLpActivationApi) {
      const { data: lpFundId, error: lpFundError } = await supabase.rpc('resolve_my_lp_fund', {})
      if (lpFundError || lpFundId !== tenant.id) return hostNotFound()
    }
    const expectedGpFundId = tenant && !isLpApiRoute && !isTenantCredentialOrOnboardingApi(pathname)
      ? tenant.id
      : undefined
    const denial = await gateApiRequest(
      supabase,
      request,
      user.id,
      expectedGpFundId,
    )
    if (denial) return denial
  }

  // ── LP / GP route separation ─────────────────────────────────────────────
  // The GP (fund_members) and LP (lp_accounts) access graphs are independent;
  // route context decides which applies. /portal is LP-only; the GP app is for
  // members. A dual GP+LP user is allowed in both. Resolved from the user's OWN
  // rows (RLS-scoped) — never cross-referenced.
  if (user && !isApiRoute && !isAuthRoute && !isPublicMarketingRoute && !isPublicTokenRoute && !isSetupRoute && !isOAuthDiscovery && !isOnboardingRoute) {
    const [{ data: membership }, { data: lpAccount }, lpFundResult] = await Promise.all([
      supabase.from('fund_members').select('fund_id').eq('user_id', user.id).maybeSingle(),
      supabase.from('lp_accounts').select('status').eq('auth_user_id', user.id).maybeSingle(),
      tenant ? supabase.rpc('resolve_my_lp_fund', {}) : Promise.resolve({ data: null, error: null }),
    ])
    const isGp = !!membership
    const gpFundId = (membership as { fund_id?: string } | null)?.fund_id ?? null
    const lpStatus = (lpAccount as { status?: string } | null)?.status ?? null
    const isActiveLp = lpStatus === 'active'

    if (tenant) {
      if ((gpFundId && gpFundId !== tenant.id) || (isActiveLp && lpFundResult.data !== tenant.id)) {
        return hostNotFound()
      }
    }

    if (isPortalRoute) {
      // An already-active LP has no business on the onboarding page.
      if (isActiveLp && isPortalWelcome) {
        const url = canonicalRedirectUrl(request)
        url.pathname = '/portal/overview'
        return NextResponse.redirect(url)
      }
      // Only active LPs (incl. active LPs who are also GPs) belong in the portal.
      if (!isActiveLp) {
        const url = canonicalRedirectUrl(request)
        url.pathname = lpStatus === 'invited' ? '/portal/welcome' : (isGp ? '/' : '/auth')
        if (url.pathname !== pathname) return NextResponse.redirect(url)
      }
    } else if (lpStatus === 'invited' && !isGp) {
      // A pending LP must finish the tenant-scoped activation flow even when a
      // stale/deep `next` path or direct navigation points at the GP app.
      const url = canonicalRedirectUrl(request)
      url.pathname = '/portal/welcome'
      return NextResponse.redirect(url)
    } else if (isActiveLp && !isGp) {
      // LP-only user on a GP route → their portal.
      const url = canonicalRedirectUrl(request)
      url.pathname = '/portal/overview'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

function canonicalRedirectUrl(request: NextRequest): URL {
  return new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    canonicalFundRequestOrigin(request),
  )
}

/**
 * Deny an API request the caller has no grant for; null lets it through.
 *
 * Fail-closed on an unrecognised /api path: an unmapped route is an unanswered question, not an
 * open door. lib/access/route-domains.test.ts makes that safe by failing CI when a route has no
 * entry, and match-route.test.ts round-trips every entry, so "unrecognised" means "not ours".
 */
async function gateApiRequest(
  supabase: ReturnType<typeof createServerClient>,
  request: NextRequest,
  userId: string,
  expectedFundId?: string,
): Promise<NextResponse | null> {
  const key = matchRoute(request.nextUrl.pathname)

  if (!key) {
    console.error(`[access] unmapped API route: ${request.nextUrl.pathname} — denying`)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Host/Fund equality is an identity boundary, not a domain grant. Enforce it
  // before both early-return classes below: `any` routes still read the
  // caller's Fund, and internally-gated routes such as pending-actions must
  // never receive a sibling Fund's session in the first place.
  let access = expectedFundId
    ? await resolveAccessContext(supabase as never, userId)
    : null
  if (expectedFundId && (!access || access.fundId !== expectedFundId)) {
    return hostNotFound()
  }

  // Authenticates by some other means (API key, cron secret, webhook token, LP portal account) or
  // serves no fund data. Each entry carries its reason.
  if (key in UNGATED_ROUTES) return null

  const entry = ROUTE_DOMAINS[key]
  const level = requiredLevel(entry, request.method)

  // Membership is the whole test — the caller's own data, or a route that gates per domain itself.
  // Checked before the query so those routes cost nothing here.
  if (level === 'any') return null

  // ONE round trip: fund, role, feature switches, grants and defaults together. This runs on every
  // /api request, so it resolves live (a revoked grant bites on the next request, with no token to
  // hunt down and no cache to wait out) — which is exactly why the one call has to be cheap.
  if (!access) access = await resolveAccessContext(supabase as never, userId)

  // Not a fund member: an LP-portal-only user, or a pending join request. The route's own
  // membership lookup returns the right error; nothing here to gate.
  if (!access) return null

  if (hasAccess(access, entry.domain, level, entry.feature)) return null

  if (access.role === 'viewer' && level === 'write') {
    return NextResponse.json({ error: 'This is a read-only demo. Changes are not allowed.' }, { status: 403 })
  }
  const label = DOMAIN_META[entry.domain].label
  return NextResponse.json(
    { error: level === 'write' ? `You do not have write access to ${label}.` : `You do not have access to ${label}.` },
    { status: 403 },
  )
}

function hostNotFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

function isTenantCredentialOrOnboardingApi(pathname: string): boolean {
  return pathname === '/api/auth/branding'
    || pathname === '/api/auth/signup'
    || pathname === '/api/auth/logout'
    || pathname.startsWith('/api/onboarding/')
    || pathname.startsWith('/api/public/')
    || pathname === '/api/fund-invitations/accept'
    || pathname.startsWith('/api/oauth/')
    || pathname === '/api/mcp'
    || pathname === '/api/agent'
    || pathname === '/api/locale'
}

export const config = {
  matcher: [
    // Exclude: Next.js internals, static assets, and the inbound email webhook.
    // The webhook receives large Postmark payloads (base64 attachments) that must
    // not pass through the Edge middleware layer, which has a tight body-size limit.
    '/((?!_next/static|_next/image|_supabase|favicon.ico|api/inbound-email|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
