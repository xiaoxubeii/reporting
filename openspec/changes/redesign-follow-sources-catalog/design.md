## Context

Reporting has two distinct Miniflux domains. A global non-admin `reporting_explore` collector owns the curated categories, sources, and articles; each Reporting user has a separate personal Miniflux account that owns subscriptions, folders, unread state, and saved state. The current `/feeds/sources` page only projects the personal account, so its topic cards are management folders rather than a discovery catalog. The existing Explore service already enforces collector identity, namespaced references, and server-side ownership checks for Follow.

This change must make curated source discovery the default without exposing collector credentials, accepting client-supplied source URLs for curated Follow, mirroring feeds into Reporting tables, or weakening the personal-account boundary. It must also preserve the current website/RSS discovery and personal source-management workflows.

## Goals / Non-Goals

**Goals:**

- Make `/feeds/sources` a clear, responsive two-view experience: curated discovery first and personal source management second.
- Expose a bounded read-only source catalog from the collector with category and deterministic featured-source projections.
- Search curated sources by title, site, or category, while continuing to discover arbitrary public website/RSS URLs through the existing endpoint.
- Reuse the namespaced Explore Follow mutation and show personal Follow state without mutating collector state.
- Preserve personal health, folder, connection/provisioning, Follow-category, and Unfollow behavior.

**Non-Goals:**

- Add Reddit, newsletter email ingestion, Google News, language filtering, or source-language metadata.
- Add a Reporting source table, favicon cache, recommendation ranker, or AI-generated source descriptions.
- Expose collector feed URLs as the authority for a Follow mutation.
- Redesign the Today article Explore view.

## Decisions

### Add a read-only curated source catalog route

`GET /api/feeds/explore/sources` accepts optional bounded `category` and `q` parameters and returns collector-owned source references with title, site URL, and category. The DTO intentionally omits collector credentials, personal state, article state, and the feed URL used by the trusted Follow mutation. A new route is preferred over overloading article entries because source discovery and article search have different pagination and presentation contracts.

### Extend category projection with a deterministic featured source

Each returned category gains a required `featuredSource` summary. Categories without an eligible public source are omitted, so clients can render the summary without a fallback. The featured source is the lowest collector feed ID in that category; collector insertion order therefore acts as a stable curator-controlled priority without a new database. Existing category consumers ignore the additive field.

### Keep personal Follow state a separate projection

The existing `/api/feeds/explore/following` endpoint remains authoritative for which catalog source references are already in the current user's personal account. Catalog reads stay available even when that personal projection fails; the UI then renders a non-destructive unknown/disabled Follow state rather than coupling global discovery availability to personal Miniflux availability.

### Use URL-backed top-level views and category sheets

`/feeds/sources` defaults to `view=explore`; `view=following` renders the existing personal management workflow. A selected curated category is represented by a namespaced `category` query parameter and opens the existing responsive Sheet pattern. Personal folder sheets keep their existing `topic` parameter only in the Following view. URL state makes browser Back/Forward and deep links deterministic.

### Use one search surface with type-sensitive behavior

Text input in Explore is debounced into the curated source query and displays matching source rows. A public HTTP(S) website/RSS URL is submitted to the existing `/api/feeds/discover` contract and displays discovered feed candidates. Following view keeps personal source filtering. The UI does not claim to search unsupported connector types or languages.

### Preserve the server-resolved Follow boundary

Curated source rows submit only their namespaced source reference to the existing Explore Follow route. The server reparses the reference, verifies collector ownership, resolves the trusted feed URL, and writes through `FeedService` to the current user's personal Miniflux. Folder organization remains available from the Following view; catalog Follow is intentionally one action into Uncategorized so no client source metadata crosses the boundary.

### Split catalog presentation from personal management

The new catalog UI lives in a focused component rather than expanding the already large personal `FollowSources` implementation. The page shell owns URL-backed tabs and connection status; the catalog component owns curated loading/search/cards/sheet/follow state, while the existing personal list and category picker remain the Following implementation.

## Risks / Trade-offs

- **Collector order is used as featured priority** → The rule is deterministic, documented, and can later be replaced by explicit curator metadata without changing the UI DTO.
- **Personal Miniflux is unavailable while the catalog is healthy** → Catalog browsing remains available; Follow is disabled with an account-state explanation and personal errors do not erase curated results.
- **Text can look like a URL** → Only valid public HTTP(S) URL-shaped input activates RSS discovery; all other input remains curated text search.
- **A large source catalog creates repeated client requests** → Search is debounced, query length is bounded, and the collector source set is currently small; pagination is deferred until justified.
- **Tabs could imply unsupported source types** → Labels are product views (`Explore sources`, `Following`), not connector types.
- **Shared Feeds files overlap localization work** → Changes remain localized through the existing `Feeds.sources` namespace and preserve unrelated in-progress translations.

## Migration Plan

1. Add service and route contracts with compatibility tests before changing the page.
2. Add localized catalog DTOs/UI and keep the current personal management components intact under `view=following`.
3. Verify default Explore, text search, URL discovery, category Sheet, Follow, Following management, Back/Forward, and mobile layout against real Miniflux accounts.
4. Roll back by restoring the prior `FollowSources` composition; the additive read-only route and category field can remain without affecting existing consumers.

## Open Questions

None. Language filtering and additional connector types remain explicit future capabilities.
