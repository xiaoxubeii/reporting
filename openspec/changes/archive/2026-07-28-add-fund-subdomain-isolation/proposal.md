## Why

Reporting currently resolves a user's Fund from membership alone and serves every Fund from the same host. A hosted deployment needs each Fund to have a stable `<fund-slug>.fundworkspace.com` entrypoint while preserving the existing paths and GP/LP access rules, and it must prevent a session, token, or resource from being used under another Fund's hostname.

## What Changes

- Add a stable, DNS-safe, globally unique slug for every Fund and resolve supported request hosts to exactly one Fund.
- Preserve the existing public, authentication, GP application, and LP Portal paths while rendering them in the hostname's Fund context.
- Bind authenticated pages and session-backed APIs to both the current identity and the Fund resolved from the trusted hostname.
- Bind public Fund tokens and externally generated Fund links to the canonical Fund hostname without changing their paths.
- Keep host-only browser sessions and extend the existing one-account-one-Fund constraint across GP membership, direct LP links, delegated LP access, and dual GP/LP identities.
- Scope tenant-hosted signup and onboarding to the Host Fund; keep new Fund creation on the platform root or legacy self-host flow.
- Keep background jobs and inbound webhooks on their existing token/job-derived Fund authority instead of inferring Fund identity from an arbitrary Host header.
- Fail closed for unknown, reserved, malformed, or cross-Fund host contexts and add cross-tenant negative coverage for database, API, cache, token, and storage boundaries.

## Capabilities

### New Capabilities

- `fund-host-resolution`: Canonical Fund slugs, supported-host parsing, hostname classification, and Fund-safe public metadata resolution.
- `fund-host-access-boundary`: Host-to-Fund binding for sessions, GP pages, LP Portal pages, APIs, public tokens, storage resources, and external links while preserving existing route paths and role rules.
- `fund-host-branding`: Fund-specific Landing, authentication, Dashboard, and LP Portal branding selected by hostname without allowing public access to private Fund settings.

### Modified Capabilities

None. The repository has no promoted baseline capability specs; this change defines the new hosted multi-tenant contracts without changing route paths or the existing GP/LP role model.

## Impact

- Database migrations and generated database types for Fund slugs, public Fund profile data, and the cross-GP/LP one-account-one-Fund invariant.
- Next.js middleware, authentication callbacks, root/public layouts, GP application layout, LP Portal resolution, and central API access helpers.
- Public submission/expert tokens, OAuth/integration callback URL generation, email links, storage/resource checks, and hostname-aware caching.
- Wildcard DNS/TLS and Supabase redirect allowlist configuration for `*.fundworkspace.com` in hosted environments.
- New unit, migration-contract, API integration, and browser E2E tests proving same-Fund success and cross-Fund failure.
