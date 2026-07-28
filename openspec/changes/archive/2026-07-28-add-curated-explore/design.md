## Context

Reporting already treats each user's non-admin Miniflux account as the sole authority for personal subscriptions, categories, read state, and saved state. That model is correct for `Me`, but it cannot provide a deployment-wide discovery surface because an empty personal account has nothing to recommend.

Curated Explore adds one dedicated, deployment-wide, non-admin Miniflux user whose subscriptions and categories are maintained operationally. Reporting reads that account through its BFF and never exposes the collector credential to the browser. Explore is discovery-only: the collector's read and saved fields are neither returned nor mutated.

This change is intentionally a thin layer over the active Feeds product. It reuses the existing Miniflux client, feed normalization, route access gate, response envelope, URL safety policy, personal `FeedService.follow`, Today layout, and reader presentation. It adds no Reporting database objects.

## Goals / Non-Goals

**Goals:**

- Let every authorized Reporting user browse the same curated categories and latest articles.
- Keep the collector identity non-admin, server-only, and read-only from Explore.
- Keep personal Miniflux data isolated and authoritative.
- Let a user follow a curated source into their own Miniflux account without trusting a browser-supplied feed URL.
- Keep collector failures isolated from the existing personal Today experience.

**Non-Goals:**

- Trending or popularity ranking, cross-source clustering, Highlights, AI summaries, or recommendations.
- Reporting tables for sources, subscriptions, articles, read state, or saved state.
- Collector webhooks, article mirroring, background ingestion, or a V2 intelligence service.
- Per-fund collectors, per-user Explore collectors, or automatic copying of editorial categories into personal Miniflux.
- Hiding collector identifiers as secrets. V1 does not use AEAD or signed cursors.

## Decisions

### One shared non-admin collector

The deployment configures one additional Miniflux API token for the dedicated non-admin `reporting_explore` user. Explore uses the existing `MINIFLUX_BASE_URL`; only the collector token and its non-secret expected user ID are new. Each collector client verifies `/v1/me` and fails closed unless the response matches `MINIFLUX_EXPLORE_USER_ID`, the exact `reporting_explore` username, and `is_admin=false`.

This is preferred over per-fund collectors because V1 content is global and editorial. Per-fund collectors multiply accounts, tokens, curation work, and failure modes without changing the V1 result. A Reporting-owned content database was rejected because Miniflux already provides source discovery, categories, polling, parsing, and article storage.

### Read-only collector boundary

Explore has only category list, article list, article detail, and follow-through operations. Category and article reads use the collector client. Follow-through resolves a source with the collector client but writes only through the caller's personal `FeedService`. There is no Explore route for read state, saved state, source creation, category creation, or source deletion on the collector.

Explore uses a dedicated response DTO that omits `isRead` and `isSaved`. The reader opens Explore articles without the personal reader's automatic mark-read request and without read/save controls.

This is preferred over reusing the personal entry DTO because shared state fields would invite accidental UI coupling and collector mutations.

### Typed namespaced references with ownership checks

External identifiers use strict, type-specific forms:

- `explore-category:<positive-integer>`
- `explore-source:<positive-integer>`
- `explore-entry:<positive-integer>`

References are identifiers, not secrets. Parsers reject the wrong namespace, malformed values, zero, negative, unsafe integers, and oversized input. Before a source is followed, the server re-reads the collector's feeds and proves that the referenced source belongs to that collector. Entry detail is fetched with the collector credential, so Miniflux authorization proves collector ownership.

AEAD was rejected for V1 because confidentiality is unnecessary and integrity alone would not remove the required ownership lookup. Signing can be added later without changing the public resource model if enumeration becomes an operational concern.

### Thin BFF contracts

V1 adds these authenticated Feeds routes using the existing response envelope and access gate:

- `GET /api/feeds/explore/categories`
- `GET /api/feeds/explore/entries?category=<ref>&q=&limit=&offset=`
- `GET /api/feeds/explore/entries/<entry-ref>`
- `GET /api/feeds/explore/following`
- `POST /api/feeds/explore/sources/<source-ref>/follow`

Lists use the same bounded offset pagination style as personal Today. The Follow request contains no feed URL, title, or category. The server resolves a trusted feed URL from the collector, then calls `FeedService.followResolvedSource(userId, feedUrl)`. Existing canonical URL matching plus a post-error re-read makes an already-followed or concurrently-created source an idempotent success.

This is preferred over a generic proxy because an explicit allowlist is easier to authorize, test, and keep read-only.

### `Me / Explore` inside Today

Today becomes the reading surface with two sibling views. `Me` preserves all current filters, state mutations, and personal connection states. `Explore` shows categories, search, latest articles, read-only detail, and Follow actions. The selected view is URL-backed so refresh and deep links are stable. A separate best-effort personal-state request resolves collector source references against the caller's personal Miniflux feeds so `Following` survives refresh without making collector browsing depend on personal availability.

Explore can load without a personal Miniflux connection. A Follow attempt still requires a usable personal account and returns the existing safe connection error when unavailable. Collector errors render only inside Explore; switching to `Me` continues to call the existing personal endpoints.

This is preferred over placing categories in the main sidebar because Today and Follow sources are product actions, while Miniflux categories are content groupings inside the reading experience.

## Risks / Trade-offs

- [A leaked collector token could expose or modify curated subscriptions] -> Store it only in a server-side environment variable or secret file, validate it as non-admin, never serialize it, and grant no browser route that mutates the collector.
- [Numeric IDs can collide across collector and personal accounts] -> Require the `explore-*` namespace and never pass collector IDs to personal mutation methods.
- [A stale or forged source reference could follow an unintended URL] -> Re-read collector feeds and resolve the URL by collector-owned source ID immediately before following.
- [The shared collector is a read availability dependency] -> Fail Explore independently with a retryable safe error; do not alter or gate personal Today.
- [Computing initial Following status can add personal API cost] -> V1 updates the clicked button after a successful idempotent Follow and does not perform per-entry personal lookups.
- [Offset pagination can shift as new articles arrive] -> Accept this for V1 latest-article browsing; do not introduce cursor infrastructure prematurely.
- [A publisher may serve unsafe or malformed URLs] -> Continue to apply existing upstream normalization and public URL validation before personal subscription.

## Migration Plan

1. Create and curate one dedicated non-admin Miniflux user.
2. Configure its API token with `MINIFLUX_EXPLORE_TOKEN_FILE` (preferred) or `MINIFLUX_EXPLORE_TOKEN` for local development, set the verified `MINIFLUX_EXPLORE_USER_ID`, and continue using the existing Miniflux base URL.
3. Curate categories and feeds through the Miniflux operator surface, OPML import, or `scripts/miniflux-explore-curate.mjs`; Reporting exposes no collector mutation route.
4. Deploy the read-only service and routes, then enable the Today Explore UI.
5. Verify collector identity, category/list/detail reads, personal Follow isolation, and desktop/mobile browser behavior.

Rollback removes or disables the Explore UI and collector token. Personal Feeds data and behavior are unaffected because no Reporting schema or personal-account migration is introduced.

## Open Questions

None for V1. Editorial source selection and category naming are operational content decisions, not application architecture.
