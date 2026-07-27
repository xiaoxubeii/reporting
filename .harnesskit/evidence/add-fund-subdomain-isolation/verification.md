# Fund subdomain isolation verification

## Automated checks

- Full Vitest passed: 210 test files and 1582 tests passed; 3 files and 5 environment-gated tests were skipped.
- `scripts/test-fund-host-db.sh` passed against a disposable local Supabase stack. The migration, historical cross-Fund audit, one-account-one-Fund write invariants, exact-slug resolver, and same-Fund LP relationships were exercised without touching production.
- The production Next.js build passed compilation, type validation, page-data collection, and generation of all 264 routes.
- Strict OpenSpec validation, HarnessKit fast, and `git diff --check` passed.
- HarnessKit targeted and full were run. Both stop at the repository-wide `next lint` gate because of pre-existing ESLint debt. A direct comparison against `HEAD` shows the 90 errors and one warning reported in changed files already existed at the same locations before this feature; this change adds zero lint diagnostics.
- The diff and untracked source set were scanned for credentials; no embedded secret was found. Disposable E2E credentials remain outside the repository under `/tmp`.

## Browser and HTTP acceptance

Acceptance used a disposable migrated local Supabase stack and the real Next.js application on port 5040.

- `alpha.localhost` and `beta.localhost` render distinct Fund name, logo/theme values, and authentication UI.
- Correct-Fund GP users reach their Dashboard on both tenant hosts.
- The Alpha LP flow reaches branded welcome and overview pages with Fund-scoped data.
- An Alpha identity attempting Beta login receives the explicit workspace-mismatch message. The wrong-host session is cleared locally while the valid Alpha session remains usable.
- Browser cookie inspection confirms the Supabase cookie is host-only (`alpha.localhost`, path `/`, SameSite Lax in development) and is not visible or sent to the Beta sibling host.
- Desktop and mobile tenant authentication, GP Dashboard, and LP Portal layouts were inspected without cross-tenant branding bleed.
- Platform product routes, unknown tenant labels, reserved labels, and attacker-suffix hosts fail closed. A forged `X-Forwarded-Host` cannot replace the request's canonical `Host` authority.

## Deployment boundary

The code and local acceptance are complete. Production enablement remains an operator rollout: approve initial immutable Fund slugs, apply the migration, configure wildcard DNS/TLS, preserve the canonical Host at the proxy, allowlist exact Supabase/provider callback origins, and then set `FUND_WORKSPACE_ROOT_DOMAIN`. Legacy self-host mode remains active when that variable is unset.
