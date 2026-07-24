## Why

The current Follow sources page mixes personal subscription management, Miniflux folders, and URL discovery, so a new user sees little useful content before following anything. Reporting already has a trusted curated Explore collector; exposing that source catalog as the default discovery experience makes following high-quality sources visual, searchable, and immediately useful without changing the personal Miniflux ownership model.

## What Changes

- Redesign `/feeds/sources` as two URL-backed views: **Explore sources** for curated discovery and **Following** for personal subscription management.
- Add a large unified search that searches curated category/source metadata for text input and preserves website/RSS discovery for URL input.
- Add responsive Explore category cards showing the category, source count, and one deterministic featured source.
- Open a category source sheet containing every curated source in that category, current personal follow state, and in-context Follow actions.
- Keep health, folder/category, Unfollow, account provisioning, and connection controls in the Following view.
- Keep the first release limited to Website/RSS sources; do not expose unsupported Reddit, Newsletter, Google News, or language filters.
- Preserve the security boundary: the collector remains read-only and every Follow resolves a namespaced collector reference server-side before writing only to the current user's Miniflux account.

## Capabilities

### New Capabilities

- `curated-source-catalog`: Searchable curated source discovery, featured category cards, category source browsing, personal follow-state projection, and separation from personal source management.

### Modified Capabilities

None.

## Impact

- Extends `ExploreFeedService` and the authenticated `/api/feeds/explore/*` BFF with a read-only source-catalog query.
- Extends Feeds client DTOs and redesigns `components/feeds/follow-sources.tsx` while reusing existing discovery, category-selection, follow, and unfollow behavior.
- Updates English and Simplified Chinese Feeds messages, focused service/route/UI/access/localization tests, and authenticated desktop/mobile browser evidence.
- Adds no Reporting feed tables, mirrored subscriptions, durable source metadata, new external connector, or new runtime dependency.
