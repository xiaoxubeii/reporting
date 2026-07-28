# Feeds v1 verification

## Architecture status

- Miniflux is the only source of truth for feeds, categories, subscriptions, entries, read state, and starred state.
- Reporting stores only a service-role-readable encrypted connection row keyed by reporting `user_id`; a unique `external_user_id` prevents two reporting users from sharing one Miniflux account.
- Personal API tokens are issued by the automatic provisioner (with manual recovery supported when disabled), rejected when they belong to a Miniflux admin, encrypted with AES-GCM associated data bound to the reporting user and verified Miniflux identity, and re-verified with `/v1/me` before connected operations.
- The migration contains no reporting-owned feed/source/subscription/item-state tables or persistence RPCs.

## Verification completed on 2026-07-23

- Feeds and Explore focused deterministic tests passed after the final Follow-state and same-origin hardening. The completion audit reran 177 focused unit, service, route, migration, access, UI, and security tests successfully.
- Feeds production-code coverage: 83.4% statements/lines and 87.83% functions; branch coverage is 71.11%.
- TypeScript `npx tsc --noEmit`: passed.
- Next.js production build: passed after the final persistent-Follow change; all 257 static pages were generated.
- Strict OpenSpec validation and `git diff --check`: passed.
- Full Vitest suite attempt: 815 tests passed and one unrelated pre-existing assertion failed in `tests/analyst-accounting-gate.test.ts:281` because the production message now includes "Excel file"; the same failure reproduces on the base worktree. Four environment-gated integration tests are skipped in the default run and passed 4/4 when explicitly enabled against local Supabase and Miniflux. The integration loaders now read the explicit development-only `MINIFLUX_ALLOW_INSECURE_HTTP` flag from `.env.local`, so the local HTTP smoke test is reproducible without an undocumented shell override while production remains HTTPS-only.
- Code review and security review found no remaining release blockers after fixes for filtered pagination, reconnect recovery, partial state writes, stale unfollow UI, category-ID collisions, read-only demo mutation blocking, ciphertext row binding, Miniflux identity re-verification, provisioning leases, stale approval recovery, reject/approve races, and concurrent administrator demotion.
- `next lint` reached the repository's existing interactive ESLint setup prompt, so it did not provide a lint result. TypeScript and the production build both completed their configured type-validity checks.
- Dependency audit reports 22 production dependency-tree findings (1 critical, 14 high, 7 moderate); the base worktree independently reports the same 1 critical and 14 high findings. They are outside the Feeds change and were not force-upgraded because several fixes are breaking changes and `xlsx` has no available fix.

## Real local integration completed

- The connection, atomic approval, provisioning lease, and approval-claim migrations were applied and privilege-checked against the configured local `supabase-db`; browser roles cannot access the control tables/functions and `service_role` can.
- A pinned Miniflux 2.3.2 deployment is healthy on local-only HTTP. A 0600 provisioner API-key file was minted without printing the key, and Reporting automatic provisioning is enabled locally.
- Real Miniflux integration created one deterministic non-admin user/key, retried and reused the same identity/key, verified `/v1/me`, and removed the disposable user.
- Real Reporting-to-Miniflux approval integration ran three cases: it created disposable auth users/fund/request, claimed approval, exercised concurrent ensure calls, encrypted the personal token, atomically committed membership and `approved`, verified `/v1/me`, reclaimed a stale approval, proved active provisioning cannot be rejected, and proved final approval fails after reviewer admin rights are revoked. Cleanup left zero disposable Reporting users/funds, leases, or managed Miniflux users.
- Authenticated browser verification covered Me/Explore URL separation, curated category filtering, search and empty recovery, read-only article detail, personal unread/saved persistence, idempotent Follow, Follow-state restoration after reload, independent collector failure with successful Retry, and desktop/mobile layouts with no horizontal overflow.
- A disposable second Reporting admin was provisioned with a distinct personal non-admin Miniflux identity. Before Follow it saw the curated source as unfollowed while the primary user remained followed; after Follow the database showed two personal users with one feed each and one separate collector with one feed. The disposable Supabase user, fund, Miniflux user, and browser session were removed immediately after verification.
- Browser evidence: `feeds-v1-explore-desktop.png` and `feeds-v1-explore-mobile.png` from the Playwright verification output.

## Requirement-by-requirement completion audit

- **Personal browse/follow/read loop:** service and route tests prove discovery is forwarded once to Miniflux, subscriptions and categories are personal, foreign resources remain hidden by the caller token, and read/starred mutations are idempotent. The authenticated browser shows the personal category group and persisted entry state.
- **Today and reader behavior:** state tests prove category grouping preserves upstream order and pagination; the browser proves URL-backed detail, safe rendered content, original-site links, Escape close, retry states, and no fabricated fallback rows.
- **Secure per-user boundary:** current local PostgreSQL inspection shows zero Reporting feed/source/subscription/item/state tables, one encrypted connection row, a unique external Miniflux user constraint, no `anon` or `authenticated` table privilege, and service-role access only.
- **Automatic approval provisioning:** all four real Miniflux/Supabase integration cases pass, covering deterministic identity/key reuse, concurrent ensure calls, stale-claim recovery, active-provisioning reject isolation, final administrator recheck, encrypted connection persistence, and cleanup.
- **Feature access:** all Feeds pages and APIs are mapped to the `feeds` feature and `dealflow` domain; page, middleware, route-grant, and read-only-demo tests pass, while personal mutations remain available to permitted members only for their own account.
- **Shared curated collector:** runtime identity verification requires the exact `reporting_explore` non-admin user and configured external id; file-based secrets take precedence and unsafe/missing collector configuration fails closed without secret disclosure.
- **Read-only Explore and typed references:** only category/list/detail/following GET routes and the personal Follow POST route exist. Namespaced positive-integer references, wrong-type rejection, collector ownership checks, bounded pagination, and absence of collector read/save/subscription/category mutations are covered by service, route, and access-contract tests.
- **Personal Follow-through:** the server ignores browser metadata, resolves the trusted collector feed URL, follows through the caller's `FeedService`, handles concurrent/already-followed cases idempotently, and restores `Following` from the caller's personal feeds after reload.
- **Me / Explore separation:** current desktop and 390 px browser runs prove stable URL-backed switching, 10 curated articles, the `Healthcare AI` category, persistent `Following`, no personal Unread/Saved/Mark-all-read controls in Explore, read-only detail, and no horizontal overflow. Personal Me remains available independently.
- **No V2 persistence or intelligence:** no Reporting catalog, article mirror, webhook, clustering, trend score, recommendation, Highlights, or AI-summary implementation was added.

## Deployment-gated verification not completed

- No remote Supabase project is linked from this worktree, so these new migrations were not pushed remotely.
- Remote production HTTPS, DNS egress enforcement, and remote migration rollout remain deployment checks; the local authenticated two-user browser, subscription ingestion, and read/starred persistence flows are complete.

## Deployment-gated smoke checks

Before enabling Feeds in a deployment:

1. Apply the revised Feeds migration and verify the per-user connection uniqueness, encryption, service-role-only grants, and absence of feed data/state tables.
2. Set `MINIFLUX_BASE_URL` to HTTPS, `MINIFLUX_EGRESS_HARDENED=true`, and verify the Miniflux fetch network blocks private, loopback, link-local, and metadata CIDRs after DNS resolution and on every redirect hop.
3. Verify the deployed Miniflux API version supports the idempotent read/starred operation used by the BFF.
4. Approve each test reporting user and verify a distinct managed non-admin Miniflux user/token is created and `/v1/me` identities are unique.
5. Run the complete flow for two reporting users in the same fund and prove subscriptions, entries, read state, and starred state remain isolated.
