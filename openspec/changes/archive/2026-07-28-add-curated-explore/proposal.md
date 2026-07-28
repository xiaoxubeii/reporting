## Why

Reporting users can currently read only sources they personally follow. They need a platform-curated discovery surface that exposes trusted healthcare and investment publications without weakening the existing rule that each user's subscriptions, categories, read state, and saved state remain isolated in their personal Miniflux account.

## What Changes

- Add a deployment-wide Curated Explore feed backed by one dedicated non-admin Miniflux collector user.
- Add a server-only collector credential and identity verification path; the browser never receives the token or calls Miniflux directly.
- Add read-only Explore category, article-list, and article-detail BFF endpoints using namespaced collector references plus server-side collector ownership checks.
- Add a `Me / Explore` switch inside Today. Explore shows curated categories and latest articles but no simulated trending, popularity, Highlights, shared read state, or shared saved state.
- Allow an authorized user to follow an Explore source by resolving its trusted feed URL from the collector and reusing the existing personal Miniflux subscription service.
- Keep Explore unavailable states independent from personal Today so a collector failure does not break `Me`.
- Do not introduce Reporting feed tables, source catalogs, article mirrors, webhooks, clustering, trend scoring, AI summaries, or V2 intelligence storage.

## Capabilities

### New Capabilities

- `curated-explore`: Deployment-wide read-only discovery categories and articles, plus safe follow-through into the caller's personal Miniflux account.

### Modified Capabilities

None. This change composes with the active `add-feeds-product` change and does not alter the authority requirements of its `feeds-product` capability.

## Impact

- Adds server-side Explore configuration and a second non-admin Miniflux client identity alongside the existing per-user clients.
- Adds `/api/feeds/explore/*` BFF routes and Explore response contracts.
- Extends the Today client with a `Me / Explore` view while preserving the existing personal reader behavior.
- Reuses the existing Feeds feature/access gate, URL safety policy, Miniflux normalization, personal subscription service, and article reader.
- Requires deployment configuration for the shared collector base URL/token and an operationally curated Miniflux account.
