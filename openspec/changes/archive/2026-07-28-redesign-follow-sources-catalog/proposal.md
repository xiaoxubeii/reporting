## Why

The current Follow sources page mixes personal subscription management, Miniflux folders, and URL discovery, so a new user sees little useful content before following anything. Reporting already has a trusted curated Explore collector; exposing that source catalog as the default discovery experience makes following high-quality sources visual, searchable, and immediately useful without changing the personal Miniflux ownership model.

## What Changes

- Redesign `/feeds/sources` as two URL-backed views: **Explore sources** for curated discovery and **Following** for personal subscription management.
- Add a large unified search that searches curated category/source metadata for text input and preserves website/RSS discovery for URL input.
- Add responsive Explore category cards showing the category and one deterministic featured source, without secondary count text competing with the reference layout.
- Open a category source sheet containing every curated source in that category, current personal follow state, and in-context Follow actions.
- Prompt for a personal Miniflux category when following a curated source, while keeping the collector source URL server-resolved.
- Group the Following view directly by the categories assigned in the user's personal Miniflux account, omit empty categories, and keep uncategorized sources last.
- Keep health, category, Unfollow, account provisioning, and connection controls in the Following view without a separate topic-card directory.
- Keep the first release limited to Website/RSS sources; do not expose unsupported Reddit, Newsletter, Google News, or language filters.
- Preserve the security boundary: the collector remains read-only and every Follow resolves a namespaced collector reference server-side before writing only to the current user's Miniflux account.

## Capabilities

### New Capabilities

- `curated-source-catalog`: Searchable curated source discovery, featured category cards, category source browsing, personal follow-state projection, and separation from personal source management.

### Modified Capabilities

None.

## Impact

- Extends `ExploreFeedService` and the authenticated `/api/feeds/explore/*` BFF with a read-only source-catalog query and a bounded personal-category selection for trusted Follow.
- Extends Feeds client DTOs and redesigns `components/feeds/follow-sources.tsx` while reusing one shared category-selection interaction across discovered and curated sources.
- Updates English and Simplified Chinese Feeds messages, focused service/route/UI/access/localization tests, and authenticated desktop/mobile browser evidence.
- Adds no Reporting feed tables, mirrored subscriptions, durable source metadata, new external connector, or new runtime dependency.
