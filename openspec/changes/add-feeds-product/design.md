# Feeds product design

## Context

reporting is a multi-user, fund-scoped Next.js and Supabase application. Miniflux already provides the operational feed reader functions that reporting should not rebuild. The supplied Feedly screenshots establish the desired information hierarchy: a Today list, source discovery, and an overlay reader.

The existing reporting worktree is dirty in navigation and shell files, so this change is implemented on the isolated `codex/add-feeds-product` branch.

## Goals / Non-Goals

**Goals:**

- Deliver a complete first-version browse-follow-read loop.
- Automatically issue every dedicated Miniflux token during reporting account approval and keep it server-side and encrypted with the existing envelope-encryption pattern.
- Give each reporting user one dedicated non-admin Miniflux user/token so subscriptions, entries, read state, and starred state remain naturally isolated upstream.
- Preserve explicit unavailable, partial, and upstream-error states.
- Make the feature feel native to reporting on desktop and mobile.

**Non-Goals:**

- No AI, opportunity, Deal, diligence, push, webhook, or background analysis behavior.
- No reporting-owned feed, subscription, entry, read-state, or starred-state table and no hidden demo-data fallback.
- No separate Feeds access domain.

## Decisions

### Product routes and layout

- `/feeds` is Today and the default Feeds entrypoint.
- `/feeds/sources` is Follow sources.
- `?entry=<external-id>` opens a deep-linkable reader sheet.
- The existing AppSidebar gets one Feeds parent with Today and Follow sources children. The feature does not render a second permanent sidebar.
- Today groups visible entries by their Miniflux category. Categories are content sections inside Today rather than additional AppSidebar navigation levels; Follow sources remains the source-management surface.
- Feedly supplies layout and interaction reference only. reporting tokens, typography, icons, dark mode, and responsive shell remain authoritative.

### Authority boundary

- Miniflux is the sole source of truth for feeds, categories, subscriptions, entries, refresh scheduling, runtime feed health, read state, and starred state.
- Each reporting user maps to exactly one dedicated non-admin Miniflux user and one Reporting-specific API token. A Miniflux user may not be shared by reporting users.
- reporting owns only the encrypted reporting-user-to-Miniflux-user connection mapping, access decisions, BFF request validation, safe response normalization, and product UI.
- Miniflux alone owns website/RSS discovery decisions. reporting forwards one validated normalized URL to `/v1/discover`; it does not fetch target sites, parse discovery metadata, guess `/feed/` or other paths, or retry through reporting-owned discovery heuristics.
- Entry content is normalized on demand. reporting does not mirror feed metadata, entries, subscriptions, or personal state.
- The browser calls only reporting BFF endpoints. It never calls Miniflux or reads a feed table through the Supabase Data API.

### Database model

- `miniflux_connections`: one row per reporting `user_id`, containing the encrypted automatically issued API token, unique external Miniflux user id, username, verification time, and last safe error. The instance base URL is the server-only `MINIFLUX_BASE_URL`, shared by the deployment.
- `miniflux_provisioning_leases`: a service-role-only, expiring control-plane lease keyed by reporting `user_id`; it contains no feed content or personal reader state and prevents two web instances from resetting the same temporary Miniflux password concurrently.
- Only the server service role may read or mutate connection rows. No authenticated browser role receives direct table access.
- No `feed_sources`, `feed_endpoints`, `feed_subscriptions`, `feed_items`, or `feed_item_states` tables or persistence RPCs are introduced.

### Server API contract

- `GET|POST|DELETE /api/feeds/connection`: GET is read-only; in managed mode a rate-limited POST explicitly retries automatic provisioning, while manual POST/DELETE remain recovery behavior only when automatic provisioning is disabled. Secrets are never returned and the automatic UI never asks the user for a token.
- `GET /api/feeds/sources`: list and search the caller's Miniflux feeds and categories, including real follow and health metadata.
- `POST /api/feeds/discover`: validate one website or RSS URL and forward it exactly once to Miniflux `/v1/discover` using the caller's token; Miniflux is solely responsible for finding or rejecting feeds.
- `POST /api/feeds/subscriptions`: create a feed in the caller's Miniflux account, creating or selecting a Miniflux category when requested.
- `DELETE /api/feeds/subscriptions/[id]`: delete the identified feed from the caller's Miniflux account. The id is an opaque Miniflux feed id, not a reporting UUID.
- `GET /api/feeds/entries`: query the caller's Miniflux entries with upstream pagination and `status`, `starred`, and search filters; normalize upstream state directly to `isRead` and `isSaved`.
- `GET /api/feeds/entries/[id]`: return one entry authorized by the caller's Miniflux token.
- `PATCH /api/feeds/entries/[id]/state`: update the caller's Miniflux entry status/starred fields idempotently and return the normalized state.
- APIs use `{ success, data, error, meta }` envelopes and never expose upstream credentials or raw upstream error bodies.

### Access control

- Add `feeds` as a FeatureKey with default `admin` visibility.
- Map `feeds` to the existing `dealflow` domain.
- Every Feeds route declares `feature: 'feeds'`; none may inherit the domain's primary `deals` feature.
- A caller with Feeds read access may connect and manage only their own Miniflux account, subscriptions, read state, and starred state. V1 has no fund-shared feed mutation.
- Fund feature administrators control whether Feeds is available, but no v1 route lets an administrator read or manage another member's Miniflux account.

### Automatic account provisioning

- When a fund administrator approves a pending reporting account, the server ensures a dedicated Miniflux user and Reporting-specific API key exist before fund membership and approval status are committed.
- Approval first atomically claims the pending request as `provisioning`. Reject cannot race that claim; failed provisioning releases it to `pending`, and final approval atomically rechecks that the reviewer is still a fund administrator before membership is committed.
- The managed Miniflux username is a deterministic, non-email identifier derived from the reporting auth user id. Provisioning first checks the encrypted reporting mapping, then reconciles an existing managed Miniflux username, so request retries do not create duplicate users.
- Miniflux provisioning uses a deployment-only administrator API key read from `MINIFLUX_PROVISIONER_TOKEN_FILE` (preferred) or a secret-manager-injected `MINIFLUX_PROVISIONER_TOKEN`. The bootstrap administrator password is not loaded by the Reporting application. Neither secret is stored in Supabase, returned to the browser, or used as a reporting user's feed token.
- The server creates or resets the managed user's temporary random password, authenticates as that non-admin user, reuses or creates the API key with the fixed Reporting description, verifies the resulting identity, encrypts the token in `miniflux_connections`, and discards the password.
- If Miniflux or connection storage is unavailable, approval fails safely and the join request remains pending. A retry reconciles the managed Miniflux user/key and continues without a duplicate account.

### Content and URL safety

- `MINIFLUX_BASE_URL` requires HTTPS in production and is controlled by deployment configuration rather than browser/admin input. Plain HTTP is available only through an explicit local-development flag. Discovery URLs accept only HTTP(S) and reject embedded credentials.
- Discovery rejects localhost plus private, loopback, link-local, metadata and IPv4-mapped IPv6 literals, and preflights DNS answers. Because Miniflux performs the actual fetch, production also requires `MINIFLUX_EGRESS_HARDENED=true` and an isolated Miniflux network that blocks those destinations after DNS resolution and on every redirect hop.
- Miniflux API calls never follow redirects, preventing the custom authentication header from crossing origins.
- External article HTML is not rendered directly. The server derives safe plain text and a separately validated HTTP(S) image URL.
- Original links open with `noopener noreferrer`; browser code never receives the Miniflux API key.

### Failure handling

- When the connection migration has not yet been applied, read-only connection and entry status requests treat storage as unconfigured rather than returning a generic 500; connection mutations fail closed with an explicit safe configuration error.
- A caller without a connection while automatic provisioning is enabled sees an explicit provisioning/retry state rather than a token-entry form. Manual token entry remains only as a deployment recovery fallback when automatic provisioning is disabled.
- Upstream authentication, timeout, throttling, invalid response, and availability failures map to typed safe errors.
- Follow, unfollow, read, and starred mutations succeed only when Miniflux confirms the upstream operation; no local feed state is written.
- Unfollow and state mutations are idempotent. The deployment must use a Miniflux API version that supports the selected idempotent starred-state operation.
- No fake articles or silent fallback are returned when upstream is unavailable.

## Risks / Trade-offs

- Per-user Miniflux accounts may fetch the same public feed more than once, but they preserve upstream subscription and state isolation without a second reporting data model.
- Automatic provisioning introduces a privileged server-to-server dependency during account approval, so administrator secrets, idempotent reconciliation, and safe retry behavior are mandatory.
- Miniflux administrator API keys are not scope-limited. Production must isolate the provisioning boundary and restrict Reporting-to-Miniflux network access; a separate broker is the preferred hardening step when the web-process blast radius is unacceptable.
- Miniflux and Reporting cannot share one transaction. A Miniflux identity can remain orphaned if external provisioning succeeds but the final Reporting approval is rejected; V1 keeps its token server-only and inaccessible to the unapproved user, while production operations should add retention/reconciliation before automatic deprovisioning.
- The per-user provisioning lease is fixed at 120 seconds, which exceeds the current bounded Miniflux request chain. Any future increase in upstream timeouts or provisioning steps must extend or renew the lease.
- Plain-text article rendering is less rich than sanitized HTML but is a safer V1 boundary and preserves original-site access.
- Source topic exploration is limited to the caller's real Miniflux categories; V1 does not fabricate popularity or public ranking data.
- Real Miniflux and real Supabase compatibility require environment-gated integration smoke tests beyond deterministic unit tests.

## Verification

- Contract-first Vitest tests for validation, normalization, per-user Miniflux transport, upstream read/starred state, access mapping, and API error envelopes.
- Migration review proving that only the encrypted per-user connection mapping exists and only the service role can access it.
- Production build and complete test suite.
- Authenticated browser flow covering connection state, Follow sources, follow, Today list, reader, read/save persistence, failure state, and mobile layout.
