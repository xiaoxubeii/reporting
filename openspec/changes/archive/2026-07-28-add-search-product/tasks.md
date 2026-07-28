## 1. Readiness and Contracts

- [x] 1.1 Confirm `add-feeds-product` has landed and identify the reusable Miniflux client, caller-scoped authorization boundary, Feed result type, and reader action.
- [x] 1.2 Define and test the validated `POST /api/search` request and response schemas, including plain-text query limits, at-least-one-source validation, fixed source IDs, source statuses, and normalized hits.
- [x] 1.3 Define the initial Feed/Web/professional execution contracts, normalized errors, fixed result limits, and `Feed > Specialized > Web` exact merge policy.
- [x] 1.4 Register feature key `search` in the existing `dealflow` domain and define Feeds read dependency, fund adapter/source enablement, and per-user request rate limiting.

## 2. Reporting-Owned SearXNG and Web Adapter

- [x] 2.1 Add a Reporting-owned SearXNG Compose service with a version/digest-pinned image, independent environment secret, loopback-only binding, JSON output, POST search, restart policy, and a local healthcheck; do not depend on `refly_searxng`.
- [x] 2.2 Configure only `bing`, `duckduckgo`, `brave`, and `startpage` for General plus `bing news`, `duckduckgo news`, `brave.news`, and `startpage news` for News.
- [x] 2.3 Add validated server-side SearXNG URL/configuration and an availability check without exposing endpoint or engine controls to the browser.
- [x] 2.4 Implement the SearXNG Web adapter with strict timeout, cancellation, aggregate 10-candidate limit, response validation, and normalized source errors.
- [x] 2.5 Add controlled SearXNG tests for allowlist enforcement, valid/empty results, engine partial failure, rate limiting, malformed responses, timeout, and unavailable configuration.
- [x] 2.6 Route SearXNG engine traffic through the host-published Privoxy service on port 8118 using an explicit host-gateway mapping, keep SearXNG off the shared proxy network, and cover proxy health plus network isolation in deployment contract tests.
- [x] 2.7 Treat internal engine degradation as a successful Web search when valid aggregate results remain, while retaining retryable failure for zero-result engine outages and source-level professional warnings.

## 3. Feed and Professional Adapters

- [x] 3.1 Implement the Feed adapter against the authenticated caller's Miniflux connection with a 10-candidate limit and no cross-user or cross-fund credential use.
- [x] 3.2 Normalize Miniflux entries with stable IDs, source metadata, publication dates, reader actions, and available read/saved state; test authorization, empty results, timeout, and failure.
- [x] 3.3 Implement the initial `pubmed`, `clinical_trials`, `fda`, `tctmd`, and `massdevice` registry, selection validation, fund source enablement, bounded concurrency, and source-level statuses.
- [x] 3.4 Implement and fixture-test the PubMed public API adapter with a 5-candidate limit, response validation, PMID/DOI identifiers, and normalized errors.
- [x] 3.5 Implement and fixture-test the ClinicalTrials.gov API v2 adapter with a 5-candidate limit, response validation, NCT identifiers, and normalized errors.
- [x] 3.6 Implement and fixture-test the FDA/openFDA 510(k) public adapter with a 5-candidate limit, `k_number` identifiers, and normalized errors.
- [x] 3.7 Implement and fixture-test TCTMD and MassDevice website adapters with unavailable-by-default transports, fixed approved hosts/paths, bounded HTML parsing, plain-text extraction, advertisement/off-domain rejection, and visible structure-change failure; do not bypass terms, robots, or Cloudflare.
- [x] 3.8 Add contract tests proving professional sources are queried directly and never replaced by SearXNG `site:` searches or client-provided endpoints/selectors.

## 4. Search Service, Merging, and API

- [x] 4.1 Implement bounded concurrent execution for selected adapters with cancellation and `allSettled`-style partial success.
- [x] 4.2 Implement safe URL normalization, exact URL/DOI/PMID/NCT/FDA deduplication, `Feed > Specialized > Web` primary origin, provenance/identifier merging, and deterministic native-order interleaving.
- [x] 4.3 Enforce 10 Feed, 10 aggregate Web, 5 per professional source, and 30 final result limits.
- [x] 4.4 Implement authenticated `POST /api/search` with schema validation, access enforcement, CSRF-compatible handling, per-user rate limiting, source statuses, and a consistent partial-result envelope.
- [x] 4.5 Sanitize all result fields to bounded plain text and validated public/adapter-allowed HTTP(S) URLs, reject credential-bearing/private/unsafe targets, and use local placeholders instead of remote assets.
- [x] 4.6 Add privacy-safe adapter/source metrics for timing, outcome, and result count while omitting raw queries, result bodies, and external HTML.
- [x] 4.7 Add service/API/security tests for source combinations, zero sources, unauthorized access, invalid source/control fields, rate limiting, SSRF/redirect/off-domain cases, unsafe results, duplicate precedence, fixed limits, partial failures, and response/log privacy.

## 5. Search Page Experience

- [x] 5.1 Add the top-level Search navigation and responsive page shell behind `dealflow.search`.
- [x] 5.2 Build the explicit-submit plain-text query form with validation feedback and stale-result indication.
- [x] 5.3 Default available Feeds and Web to selected, default all five professional sources to unselected, disable unavailable sources with explanations, and require at least one available selection.
- [x] 5.4 Build the unified result list with primary-origin and all-source labels, professional identifiers, Feed reader actions, isolated external-link actions, and partial-error recovery.
- [x] 5.5 Implement desktop source rail and narrow-screen filter drawer behavior with native labeled controls, keyboard focus, live status announcements, and no horizontal overflow.
- [x] 5.6 Add component tests for explicit submission, defaults/fallbacks, source combinations, validation, source states, result actions, merged provenance, focus restoration, accessibility, and responsive filters.
- [x] 5.7 Align the Search page title typography with Reporting's standard top-level page heading and add regression coverage.

## 6. End-to-End Verification and Rollout

- [x] 6.1 Add automated adapter, service, route, contract, and component coverage for Feed-only, Web-only, each professional adapter, combined, no-results, zero-source, rate-limit, timeout, malformed/off-domain HTML, duplicate precedence, fixed caps, and partial-result flows; reserve real-browser evidence for 6.2.
- [x] 6.2 Verify the real desktop and mobile browser flows for keyboard navigation, focus order, screen-reader labels, contrast, external-link isolation, partial failures, and Feed reader return focus.
- [x] 6.3 Run OpenSpec strict validation, HarnessKit fast/targeted verification, type checking, lint, focused unit/integration tests, Compose validation, and the Search browser suite; record unrelated pre-existing failures separately.
- [x] 6.4 Document Reporting SearXNG deployment, pinned image, secret generation, loopback port, engine allowlist, proxy/health behavior, source adapters, rate limits, privacy, parser breakage handling, and rollback.
- [x] 6.5 Roll out disabled by default, enable a pilot fund only after SearXNG and every fund-enabled professional source pass health/contract checks, keep unapproved website transports unavailable, monitor latency/error/result-count signals, and define broader enablement criteria.

## 7. Configurable Categories and Unified Adapter Execution

- [x] 7.1 Replace the fixed source-selection request with bounded unique category IDs and define a versioned, immutable fund category configuration contract with localized labels, descriptions, defaults, enablement, and registered adapter mappings.
- [x] 7.2 Add a forward-only migration for `fund_settings.search_category_config`, seed existing/new funds with ordered default categories, add coarse database constraints, and update generated database types without changing historical migrations.
- [x] 7.3 Add a fund-admin-only same-origin `GET`/`PUT /api/settings/search-categories` boundary that validates and atomically replaces the current fund configuration without accepting a client fund ID, endpoint, credential, selector, or executable value.
- [x] 7.4 Add a focused Settings category editor for fund administrators, including add/remove/reorder, bilingual label/description, enable/default controls, and mappings limited to the code registry.
- [x] 7.5 Replace the Provider interfaces and aggregate specialized boundary with one `SearchAdapter` contract, code-owned `AdapterRegistry`, `CategoryResolver`, and bounded `AdapterExecutor`; execute duplicate adapter mappings once and preserve adapter-level metrics/status/provenance.
- [x] 7.6 Update the Search page to render configured categories, submit category IDs, compute defaults/availability from resolved adapters, and keep result actions/statuses source-specific without exposing individual adapter selection.
- [x] 7.7 Add contract, resolver, registry, executor, settings API/component, migration, Search page, authorization, fail-closed unknown-adapter, duplicate mapping, and backward-policy tests.
- [x] 7.8 Run strict OpenSpec, focused/full verification, typecheck, changed-file lint, database/security/code review, and real authenticated browser proof that an admin category change immediately controls the Search page and execution path.
