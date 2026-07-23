## Why

Fund teams need one research surface that can search publications already available in their Miniflux account, the broader Web, and a small fixed set of professional medical sources. Reporting currently has no authenticated boundary that can federate those live sources while preserving provenance, caller access, predictable latency, and useful partial results.

## What Changes

- Add a top-level `Search` product route with one plain-text query, explicit submission, independent Feed/Web/professional-source selection, and one normalized result list.
- Add exactly three server-only provider boundaries: `FeedSearchProvider` for the current user's Miniflux account, `WebSearchProvider` for a Reporting-owned SearXNG instance, and `SpecializedSearchProvider` for direct professional-source adapters.
- Fix the first professional source set to the public sources already represented by ClinMono: PubMed, ClinicalTrials.gov, FDA/openFDA, TCTMD, and MassDevice.
- Add a small code-registered adapter contract supporting public APIs and bounded HTML search of the two approved medical websites; professional sources are never replaced with SearXNG `site:` queries.
- Configure SearXNG with an operator-owned allowlist for Bing, DuckDuckGo, Brave Standard, and Startpage Web/News engines; the browser cannot select individual engines.
- Query selected providers and professional sources concurrently, isolate failures, and return source-level status with successful partial results.
- Apply fixed server-owned result windows, conservative exact deduplication, `Feed > Specialized > Web` primary-origin precedence, and deterministic interleaving without cross-provider pagination.
- Enforce Search/Feeds access, provider enablement, a basic per-user request rate limit, privacy-safe operational metrics, and untrusted-content handling at the Reporting boundary.
- Do not add a Reporting-owned index, arbitrary crawling, result-detail-page fetching, paid APIs, licensed credentials, cross-provider pagination, fund quota/cost accounting, fuzzy or AI deduplication, Boolean builders, AI ranking or summaries, saved searches, monitoring, alerts, or RSSHub-backed search.

## Capabilities

### New Capabilities

- `search-product`: Federated live search across the caller's Miniflux entries, a fixed SearXNG engine allowlist, and five directly queried public professional sources, including source selection, normalized results, partial failure, access, rate limiting, privacy, safe rendering, and accessible UI behavior.

### Modified Capabilities

None.

## Impact

- Adds UI under `app/(app)/search`, protected APIs under `app/api/search`, and server-only Search service/provider/adapter modules.
- Reuses the Miniflux client, authorization boundary, and Feed reader introduced by `add-feeds-product`; implementation starts only after that change has landed.
- Adds a Reporting-owned, version-pinned SearXNG service with loopback-only exposure, JSON output, POST search, healthcheck, independent secret, and the approved Web/News engine configuration; the existing Refly-owned SearXNG container is not reused.
- Adds direct public adapters for PubMed, ClinicalTrials.gov, FDA/openFDA, TCTMD, and MassDevice using the same source identities as ClinMono where applicable.
- Updates feature metadata, route access declarations, and the existing sidebar without adding a new access domain, credential store, quota ledger, search-history table, or local search index.
