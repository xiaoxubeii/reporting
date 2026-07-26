## Context

Reporting is currently deployed as a single-tenant application even though its primary business tables are Fund-scoped. GP application requests resolve the caller's sole `fund_members` row, LP Portal requests resolve Fund identity through LP account links, and many server routes use a Supabase service-role client after performing those checks. Middleware enforces authentication and per-domain grants but does not inspect Host. The public Landing and authentication surfaces are global, while Dashboard and LP Portal already load Fund name, logo, and theme after authentication.

The hosted target is logical isolation on shared Next.js, PostgreSQL, Auth, and Storage infrastructure. Each Fund receives `<slug>.<root-domain>` while every visible path and every existing GP/LP role rule remains unchanged. One auth account belongs to at most one Fund across both the GP and LP identity graphs; existing LP schema permits multiple Fund links today, so migration must audit and reject ambiguous existing data before enabling this invariant.

## Goals / Non-Goals

**Goals:**

- Resolve every configured tenant hostname to one stable Fund and fail closed for malformed, unknown, or reserved tenant labels.
- Require the Fund resolved from Host to match the Fund authorized by a browser session, public token, API credential, LP account, or resource before serving Fund data.
- Preserve all public route paths, authentication paths, GP application paths, LP Portal paths, and existing access levels.
- Keep host-only sessions and make Landing, authentication, GP chrome, and LP Portal chrome consistently Fund-branded.
- Enforce one Fund across GP membership, direct LP links, delegated LP access, and dual GP/LP identities at migration and write time.
- Keep tenant-hosted signup/onboarding on the Host Fund and prevent tenant hosts from creating or joining another Fund.
- Preserve token/job-derived authority for internal workers and inbound webhooks.
- Retain legacy self-host behavior when tenant hosting is not configured.

**Non-Goals:**

- Allowing one auth account to belong to or switch between multiple Funds.
- Giving each Fund a separate deployment, database, Supabase project, or Storage bucket.
- Introducing custom Fund-owned domains in V1.
- Adding arbitrary HTML/CSS Landing editors or changing current Landing content and navigation paths.
- Replacing existing roles, domain grants, LP account rules, or public token formats solely for tenant hosting.

## Decisions

### 1. Tenant hosting is an explicit deployment mode

`FUND_WORKSPACE_ROOT_DOMAIN` enables tenant hosting. When absent, existing self-host behavior remains unchanged. When present, a pure parser classifies each canonical request hostname as platform root, tenant, reserved/internal, or invalid. It accepts exactly one DNS label before the configured root domain, normalizes ASCII case and a terminal dot, rejects ambiguous forwarded-host lists and Unicode/punycode labels in V1, and reserves system labels such as `www`, `api`, `auth`, `admin`, `hooks`, and `internal`.

This explicit mode avoids turning preview URLs and existing self-host installations into accidental tenant hosts. A configured but malformed root fails closed; it never silently becomes legacy mode. A permissive "last two labels" parser was rejected because it accepts attacker-controlled suffixes and public-suffix edge cases.

Hosted request admission is explicit:

| Host class | Public/auth/onboarding | GP/LP pages and session APIs | Fund public tokens/OAuth/MCP | Worker/cron/webhooks |
| --- | --- | --- | --- | --- |
| tenant | allowed on existing paths; onboarding is scoped to Host Fund | allowed only after identity Fund equality | allowed only after credential/token Fund equality | denied |
| platform root | global public/auth/setup and new-Fund creation | denied because no Fund Host exists | central platform-only callbacks/discovery explicitly classified | allowed only for configured platform endpoints and their existing authentication |
| reserved/internal | only the specifically registered system surface | denied by default | only the specifically registered system surface | allowed only for the exact registered system surface |
| invalid/unknown | denied uniformly before session or handler work | denied | denied | denied |

Inbound webhooks do not use Host to select Fund, but hosted mode still requires an explicitly allowed platform/hook host. Background workers similarly use a configured platform/internal origin and never run on tenant hosts. Existing middleware early bypasses move after Host classification.

### 2. Fund slug is stable data, not a derivation of the mutable Fund name

`funds.slug` is lowercase, DNS-safe, globally unique, non-null, and immutable through normal Fund rename operations. Existing Funds receive deterministic backfilled slugs; newly created Funds receive a normalized name-based slug with a collision-safe suffix when necessary. Database constraints are the final authority.

An exact-slug security-definer RPC returns only a safe tenant descriptor (`id`, `slug`, `name`, `logo_url`, validated theme) to anonymous callers. Broad anonymous `funds` or `fund_settings` SELECT policies are not introduced.

The same migration audits every auth user across `fund_members`, direct `lp_account_links`, and delegated `lp_authorized_users`. If any user resolves to more than one distinct Fund, migration stops with a remediation error rather than silently disabling access. Database triggers reject future GP memberships, LP links, delegations, and LP-account activations that would cross the user's existing Fund. Multiple LP investors inside the same Fund remain valid.

### 3. Middleware supplies a trusted slug and enforces the session boundary centrally

Middleware removes any incoming internal tenant headers, parses the request URL host, and injects only its own normalized tenant slug for downstream server components. In tenant mode it resolves the slug through the safe RPC. Unknown tenants return a uniform 404.

For GP/session APIs and pages, middleware compares the resolved Fund ID with the authenticated user's live access context. For LP Portal paths it compares against a database function that resolves exactly one Fund from the caller's active LP links. A mismatch is denied before the page or handler executes. Existing route-domain grants remain an additional check after the Fund match.

This central choke point minimizes changes to hundreds of existing routes, while existing route-level `fund_id` filters and RLS remain defence in depth. Trusting a client-supplied header or merely changing page branding was rejected because either permits cross-Fund execution.

### 4. Paths do not encode tenant identity

The external URL remains `/`, `/auth`, `/dashboard`, `/lps`, `/portal/overview`, and the existing API paths. Server components read the trusted request tenant context; no user-visible `/funds/<slug>/...` prefix is added. Any internal rewrite must remain invisible and must retain Host/slug in cache keys.

### 5. Browser sessions remain host-only

Supabase cookies keep no parent `Domain` attribute. Signing in on one tenant hostname therefore does not send that session to another tenant hostname. The server still performs the explicit Fund match after login because valid credentials for Fund A can be entered on Fund B.

Parent-domain shared cookies were rejected because they widen subdomain takeover, cookie tossing, and cross-tenant CSRF impact without adding value to a one-account-one-Fund product.

Password, OTP, magic-link, and callback flows validate the newly authenticated identity against the Host Fund before final navigation. On mismatch the server signs out that hostname's new session, clears its Supabase cookies, and returns to `/auth` with a bounded workspace-mismatch code so the user is not trapped in a persistent denial loop.

### 6. Tenant signup and onboarding cannot change tenant context

Tenant `/auth/signup` keeps existing whitelist and email-verification behavior. Tenant `/onboarding` may only inspect, request to join, or activate access for the Host Fund, and existing email-domain/invitation approval rules still apply. Client-supplied Fund IDs are ignored or required to equal the trusted Host Fund. Tenant hosts cannot call the new-Fund creation route.

Platform-root onboarding may create a new Fund through the existing path, after which the server returns its canonical tenant origin. Legacy self-host mode preserves the current create/join behavior.

### 7. Each identity mode binds to the same Fund in its own authoritative layer

- GP browser pages and session APIs use live `fund_members`/access context.
- LP Portal pages and APIs use active LP account links and require a single resolved Fund.
- Public submission and expert-response tokens resolve their persisted Fund and compare it with Host.
- API keys and OAuth/MCP credentials compare their embedded/persisted Fund with Host.
- Service-role resource reads and writes continue to include the authorized Fund ID.
- Background jobs derive Fund from their persisted job and signed job token, and run only on configured platform/internal hosts.
- Inbound webhooks arrive only on registered platform/hook hosts and derive Fund from verified provider credentials, addresses, or persisted records, never from Host.

### 8. Canonical links are built from persisted slug plus configured root domain

Fund-facing email, invitation, public submission, and tenant OAuth callback URLs use a canonical origin built from the validated persisted slug and configured root domain. Tenant OAuth issuer/resource/callback and signed state/code/refresh-token records bind the same Fund and canonical origin. They never echo an arbitrary request Host or accept an untrusted forwarded-host list. Platform/internal callbacks that intentionally remain central use a separately configured canonical application origin.

When tenant mode is disabled, existing `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` link and callback behavior remains unchanged.

### 9. Branding uses a request-scoped safe tenant descriptor

A server resolver loads the safe tenant descriptor by trusted slug and caches it by slug. Landing/public chrome and authentication consume that descriptor. GP and LP application chrome keep their current authoritative membership/link-derived branding and additionally benefit from the middleware Fund match. Only whitelisted name, logo, and theme fields cross the anonymous boundary.

## Risks / Trade-offs

- **[Host spoofing or proxy ambiguity]** → Parse only the framework's canonical request URL in the trusted deployment path, reject ambiguous forwarded-host input, allowlist the configured root, and cover suffix/port/case/trailing-dot attacks.
- **[Service-role query bypasses RLS]** → Enforce the Host/Fund match before handlers and retain explicit `fund_id` filters on resource queries; audit exception routes separately.
- **[Cross-Fund cache contamination]** → Key tenant descriptor and rendered public content by slug and avoid global unkeyed caches for tenant branding.
- **[Legacy deployment regression]** → Make tenant mode opt-in and retain existing behavior when the root-domain setting is absent.
- **[Existing LP account linked across Funds]** → Stop migration with an actionable data audit result; add write-time database constraints so production never chooses an arbitrary Fund.
- **[Redirect provider limitations]** → Document and verify wildcard Supabase redirect allowlisting and canonical callback origins before production activation.
- **[Slug rename breaks durable links]** → Treat slug as stable; future renames require explicit aliases/redirects outside V1.
- **[Enumeration of public Fund presence]** → Return only explicitly public fields and a uniform 404; Fund hostnames are inherently public DNS identities.

## Migration Plan

1. Add constrained Fund slugs, backfill existing Funds, add safe host-resolution/LP-resolution database functions, and deploy with tenant mode disabled.
2. Deploy host parser, tenant resolver, branding provider, canonical-link builder, and test coverage while still in legacy mode.
3. Configure wildcard DNS/TLS, Supabase redirect allowlist, and `FUND_WORKSPACE_ROOT_DOMAIN` in a staging environment.
4. Audit and remediate any auth identity that currently reaches more than one Fund, then verify assigned Fund slugs.
5. Run same-Fund positive and cross-Fund negative browser/API/token/storage tests, enable tenant mode, and monitor unknown-host, Fund-mismatch, callback, and public-token denials.

Rollback disables `FUND_WORKSPACE_ROOT_DOMAIN`, restoring legacy host behavior while retaining inert slug data. The migration does not delete or rewrite Fund-owned business data.

## Open Questions

- Production hosting must confirm the exact trusted canonical-host behavior and wildcard TLS/DNS configuration before tenant mode is enabled.
- Product operations must approve the initial slug assigned to each existing Fund before public rollout; implementation supplies safe deterministic defaults.
