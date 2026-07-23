# Feeds product implementation tasks

## 1. Contracts and tests

- [x] 1.1 Add tests for URL policy, pagination, and safe content extraction.
- [x] 1.2 Add failing tests for per-user Miniflux authentication, feed/category listing, upstream filters, read/starred normalization and mutations, timeouts, and typed errors.
- [x] 1.3 Add failing tests for access-domain/feature mapping and every Feeds API route.
- [x] 1.4 Add failing tests proving two reporting users in one fund use different Miniflux accounts and cannot observe each other's feeds or state.
- [x] 1.5 Add a migration contract test proving no local feed/source/subscription/entry/state tables or persistence RPCs exist.
- [x] 1.6 Add failing tests for deterministic Miniflux user provisioning, API-key reuse, partial-failure retry, approval fail-closed behavior, and secret non-disclosure.

## 2. Persistence and external adapter

- [x] 2.1 Replace the persistence migration with a service-role-only encrypted connection mapping keyed by reporting user id and unique Miniflux user id.
- [x] 2.2 Implement per-user encrypted Miniflux credential storage with manual recovery connect/disconnect behavior.
- [x] 2.3 Extend the Miniflux transport for feeds, categories, discovery, follow/unfollow, filtered entries, and idempotent read/starred mutations.
- [x] 2.4 Remove reporting-owned feed/source/subscription/item-state repositories, tables, and RPCs.
- [x] 2.5 Implement the server-only Miniflux administrator adapter and retry-safe per-reporting-user account/token provisioning.
- [x] 2.6 Remove reporting-owned discovery heuristics so website/RSS discovery is delegated exactly once to Miniflux.

## 3. Protected APIs

- [x] 3.1 Make connection status/connect/disconnect operate only on the authenticated reporting user's mapping.
- [x] 3.2 Serve source/category search, discovery, and follow/unfollow directly from the caller's Miniflux account.
- [x] 3.3 Serve entry list/detail and read/starred mutations directly from the caller's Miniflux account.
- [x] 3.4 Update route access contracts for personal feed management while keeping every route behind the `feeds` feature.
- [x] 3.5 Provision and encrypt the target user's Miniflux connection before a pending reporting account is approved.

## 4. Product UI

- [x] 4.1 Add Feeds feature visibility and Today/Follow sources navigation.
- [x] 4.2 Send Today status/starred/search filters through the BFF and render Miniflux pagination/state.
- [x] 4.3 Make the reader's read/saved controls persist to Miniflux and verify state after reload.
- [x] 4.4 Update Follow sources and connection copy/controls for one Miniflux account per reporting user and Miniflux-backed categories.
- [x] 4.5 Remove token-entry onboarding when automatic provisioning is enabled and show a safe managed-account recovery state.
- [x] 4.6 Group Today entries by their Miniflux categories while preserving upstream ordering, pagination, and personal state controls.

## 5. Review and verification

- [x] 5.1 Run focused and full Vitest suites and production build for the per-user Miniflux architecture.
- [x] 5.2 Run code review and security review; address critical/high findings.
- [x] 5.3 Run the real authenticated desktop and mobile browser flow with two reporting users and capture isolation/state screenshots.
- [x] 5.4 Record final verification evidence and remaining environment-gated Miniflux/Supabase smoke risks.
- [x] 5.5 Handle an unapplied `miniflux_connections` migration as an explicit unconfigured state instead of a generic page failure, with regression tests.
- [x] 5.6 Verify the authenticated browser page after retry shows the next actionable Miniflux configuration state without a connection-storage 500.
- [x] 5.7 Deploy pinned Miniflux v2 with an isolated PostgreSQL volume, local-only HTTP binding, one-time admin bootstrap secrets, and configure the Reporting BFF base URL.
- [x] 5.8 Run a real approval-to-Miniflux-user/token smoke test, verify retry isolation, and complete code/security review.
- [x] 5.9 Make the real local integration tests load the explicit development-only insecure-HTTP flag from `.env.local`, then rerun all four Miniflux/Supabase integration cases and verify cleanup.
