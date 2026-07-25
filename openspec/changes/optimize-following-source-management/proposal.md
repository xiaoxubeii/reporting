## Why

The Following view currently repeats source metadata across a large nested card and endpoint layout, making a small subscription list feel heavy and forcing users to scan more UI than the management task requires. A compact, category-first presentation can make followed sources faster to find and manage while preserving Miniflux as the sole source of truth.

## What Changes

- Give Explore and Following distinct search behavior: Explore keeps website/RSS discovery, while Following exposes a focused local filter and a clear route back to source discovery.
- Replace the large nested Following cards with compact, category-grouped source rows that show one source identity, useful origin metadata, and health only when actionable.
- Replace the passive Following button with an accessible source actions menu for opening the source website, copying the RSS URL, and unfollowing.
- Remove redundant headings, duplicate endpoint titles, and raw URL emphasis from the default Following presentation.
- Keep personal categories, source membership, health, and unfollow behavior backed by the existing authenticated Miniflux projection and APIs.

## Capabilities

### New Capabilities

- `following-source-management`: A compact, localized, responsive personal source-management view with category grouping, local filtering, and explicit per-source actions.

### Modified Capabilities


## Impact

- Affects `components/feeds/follow-sources.tsx`, a focused source-actions component, feed localization messages, and feed UI behavior tests.
- Does not add or change Reporting database tables, Miniflux data ownership, subscription routes, or permission boundaries.
- Reuses the existing URL-backed Explore/Following navigation and authenticated subscription deletion contract.
