## Why

Fund teams need one research surface that can search publications already available in their Miniflux account, the broader Web, and a small reviewed set of professional medical sources. Reporting currently has no authenticated boundary that can federate those live sources while preserving provenance, caller access, predictable latency, and useful partial results. A fixed list of individual sources is also too technical for everyday users: they should choose fund-configured search categories while Reporting resolves those categories to code-reviewed adapters.

## What Changes

- Add a top-level `Search` product route with one plain-text query, explicit submission, fund-configured category selection, and one normalized result list.
- Use one server-only `SearchService` with a `CategoryResolver`, code-owned `AdapterRegistry`, and bounded `AdapterExecutor`; do not add a parallel Provider abstraction.
- Treat the caller's Miniflux search, Reporting-owned SearXNG search, and every direct professional source as adapters with one execution contract.
- Let fund administrators configure ordered category labels, descriptions, defaults, enablement, and mappings to registered adapter IDs from Settings. Category configuration never stores endpoints, credentials, engines, selectors, executable code, or dynamic imports.
- Fix the first professional source catalog to PubMed, ClinicalTrials.gov, FDA/openFDA 510(k), TCTMD, and MassDevice. Website transports remain unavailable until operator permission and a reachable approved endpoint exist.
- Add a small code-registered adapter contract supporting public APIs plus fixture-tested bounded HTML parsers for the two catalogued medical websites; professional sources are never replaced with SearXNG `site:` queries and a disabled website transport is never bypassed.
- Configure SearXNG with an operator-owned allowlist for Bing, DuckDuckGo, Brave Standard, and Startpage Web/News engines; the browser cannot select individual engines.
- Resolve selected category IDs on the server, intersect their adapter IDs with the code registry, fund policy, caller access, and runtime availability, then query selected adapters concurrently while preserving source-level status and successful partial results.
- Apply fixed server-owned result windows, conservative exact deduplication, `Feed > Specialized > Web` primary-origin precedence, and deterministic interleaving without cross-adapter pagination.
- Enforce Search/Feeds access, adapter enablement, a basic per-user request rate limit, privacy-safe operational metrics, and untrusted-content handling at the Reporting boundary.
- Do not add a Reporting-owned index, arbitrary crawling, result-detail-page fetching, paid APIs, licensed credentials, cross-adapter pagination, fund quota/cost accounting, fuzzy or AI deduplication, Boolean builders, AI ranking or summaries, saved searches, monitoring, alerts, or RSSHub-backed search.

## Capabilities

### New Capabilities

- `search-product`: Federated live search across the caller's Miniflux entries, a fixed SearXNG engine allowlist, and five directly queried public professional sources, including fund-configured Category-to-Adapter selection, normalized results, partial failure, access, rate limiting, privacy, safe rendering, and accessible UI behavior.

### Modified Capabilities

None.

## Impact

- Adds UI under `app/(app)/search`, a fund-admin category editor under Settings, protected APIs under `app/api/search` and `app/api/settings/search-categories`, and server-only Search service/category/adapter modules.
- Reuses the Miniflux client, authorization boundary, and Feed reader introduced by `add-feeds-product`; implementation starts only after that change has landed.
- Adds a Reporting-owned, version-pinned SearXNG service with loopback-only exposure, JSON output, POST search, healthcheck, independent secret, and the approved Web/News engine configuration; the existing Refly-owned SearXNG container is not reused.
- Adds direct public adapters for PubMed, ClinicalTrials.gov, and FDA/openFDA 510(k), plus registered fixture-tested TCTMD and MassDevice website adapters whose live transports default unavailable pending permission/reachability.
- Adds fund-scoped `search_category_config` JSON configuration with an operator default, while retaining the existing source policy as a second execution allowlist. It does not add a platform-admin role, credential store, quota ledger, search-history table, or local search index.
