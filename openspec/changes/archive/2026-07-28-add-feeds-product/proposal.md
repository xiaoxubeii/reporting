# Add the first-version Feeds product

## Why

Fund teams need a lightweight way to follow trusted publications and review new articles without leaving reporting. The product already owns dealflow permissions and fund membership, but it has no source catalog, subscription experience, or reading surface.

## What Changes

- Add a `Feeds` product area with `Today` and `Follow sources` routes inspired by the supplied Feedly interaction references while using reporting's existing shell and design tokens.
- Automatically provision one dedicated non-admin Miniflux user and Reporting-specific API token when a fund administrator approves a reporting account. reporting stores only the encrypted per-user connection mapping.
- Add a server-only Miniflux adapter for connection validation, feed/category listing, discovery, follow/unfollow, entry listing/detail, and read/starred mutations.
- Keep Miniflux as the sole source of truth for feeds, subscriptions, entries, read state, and starred state; the reporting browser reaches those resources only through protected reporting BFF routes.
- Add protected Feeds APIs with explicit `feeds` feature gating inside the existing `dealflow` access domain.
- Add an article reader sheet, explicit loading/empty/error states, and responsive behavior.

## Non-goals

- AI feeds, summaries, highlights, clustering, Candidate Opportunity, or Deal creation.
- reporting-owned RSS fetching, parsing, scheduling, webhooks, or article mirroring.
- reporting-owned feed catalogs, subscription mappings, entry tables, or read/starred state.
- Reddit, newsletters, Google News, trending charts, follower counts, or public catalog ranking.
- A new access domain or a second application sidebar.

## Capabilities

### New Capabilities

- `feeds-product`: User-scoped source discovery, following, reading, and read/starred state owned by Miniflux and exposed through the reporting BFF.

### Modified Capabilities

- `access-control`: Add the `feeds` feature key to the existing `dealflow` domain and register every Feeds API route.
- `navigation`: Add a Feeds section with Today and Follow sources children.

## Impact

- Next.js routes and UI under `app/(app)/feeds` and `app/api/feeds`.
- New `lib/feeds` application, credential, validation, and Miniflux adapter modules.
- Existing member-approval API, with retry-safe Miniflux account provisioning before approval completes.
- Supabase migration for a service-role-only encrypted per-user Miniflux connection mapping; no feed content or state tables.
- Feature visibility, access route registry, and sidebar navigation updates.
- New Vitest coverage plus required real-browser verification.
