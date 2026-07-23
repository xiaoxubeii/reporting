## 1. Readiness and Contracts

- [ ] 1.1 Confirm `add-feeds-product` has landed and identify the reusable Miniflux client, caller-scoped authorization boundary, Feed result type, and reader action.
- [ ] 1.2 Define and test the validated `POST /api/search` request and response schemas, including plain-text query limits, at-least-one-source validation, fixed source IDs, source statuses, and normalized hits.
- [ ] 1.3 Define the three provider interfaces, five-source specialized descriptor/adapter contract, normalized errors, fixed result limits, and `Feed > Specialized > Web` exact merge policy.
- [ ] 1.4 Register feature key `search` in the existing `dealflow` domain and define Feeds read dependency, fund provider/source enablement, and per-user request rate limiting.

## 2. Reporting-Owned SearXNG and Web Provider

- [ ] 2.1 Add a Reporting-owned SearXNG Compose service with a version/digest-pinned image, independent environment secret, loopback-only binding, JSON output, POST search, restart policy, and a local healthcheck; do not depend on `refly_searxng`.
- [ ] 2.2 Configure only `bing`, `duckduckgo`, `brave`, and `startpage` for General plus `bing news`, `duckduckgo news`, `brave.news`, and `startpage news` for News.
- [ ] 2.3 Add validated server-side SearXNG URL/configuration and an availability check without exposing endpoint or engine controls to the browser.
- [ ] 2.4 Implement `WebSearchProvider` with strict timeout, cancellation, aggregate 10-candidate limit, response validation, and normalized source errors.
- [ ] 2.5 Add controlled SearXNG tests for allowlist enforcement, valid/empty results, engine partial failure, rate limiting, malformed responses, timeout, and unavailable configuration.

## 3. Feed and Specialized Providers

- [ ] 3.1 Implement `FeedSearchProvider` against the authenticated caller's Miniflux connection with a 10-candidate limit and no cross-user or cross-fund credential use.
- [ ] 3.2 Normalize Miniflux entries with stable IDs, source metadata, publication dates, reader actions, and available read/saved state; test authorization, empty results, timeout, and failure.
- [ ] 3.3 Implement `SpecializedSearchProvider` with the fixed `pubmed`, `clinical_trials`, `fda`, `tctmd`, and `massdevice` registry, selection validation, fund source enablement, bounded concurrency, and source-level statuses.
- [ ] 3.4 Implement and fixture-test the PubMed public API adapter with a 5-candidate limit, response validation, PMID/DOI identifiers, and normalized errors.
- [ ] 3.5 Implement and fixture-test the ClinicalTrials.gov API v2 adapter with a 5-candidate limit, response validation, NCT identifiers, and normalized errors.
- [ ] 3.6 Implement and fixture-test the FDA/openFDA public adapter with a 5-candidate limit, documented endpoint selection, allowlisted FDA identifiers, and normalized errors.
- [ ] 3.7 Implement and fixture-test direct TCTMD and MassDevice website adapters with fixed search/result hosts and paths, bounded HTML parsing, plain-text extraction, advertisement/off-domain rejection, and visible structure-change failure.
- [ ] 3.8 Add contract tests proving professional sources are queried directly and never replaced by SearXNG `site:` searches or client-provided endpoints/selectors.

## 4. Search Service, Merging, and API

- [ ] 4.1 Implement bounded concurrent execution for selected providers and professional adapters with cancellation and `allSettled`-style partial success.
- [ ] 4.2 Implement safe URL normalization, exact URL/DOI/PMID/NCT/FDA deduplication, `Feed > Specialized > Web` primary origin, provenance/identifier merging, and deterministic native-order interleaving.
- [ ] 4.3 Enforce 10 Feed, 10 aggregate Web, 5 per professional source, and 30 final result limits.
- [ ] 4.4 Implement authenticated `POST /api/search` with schema validation, access enforcement, CSRF-compatible handling, per-user rate limiting, source statuses, and a consistent partial-result envelope.
- [ ] 4.5 Sanitize all result fields to bounded plain text and validated public/adapter-allowed HTTP(S) URLs, reject credential-bearing/private/unsafe targets, and use local placeholders instead of remote assets.
- [ ] 4.6 Add privacy-safe provider/source metrics for timing, outcome, and result count while omitting raw queries, result bodies, and external HTML.
- [ ] 4.7 Add service/API/security tests for source combinations, zero sources, unauthorized access, invalid source/control fields, rate limiting, SSRF/redirect/off-domain cases, unsafe results, duplicate precedence, fixed limits, partial failures, and response/log privacy.

## 5. Search Page Experience

- [ ] 5.1 Add the top-level Search navigation and responsive page shell behind `dealflow.search`.
- [ ] 5.2 Build the explicit-submit plain-text query form with validation feedback and stale-result indication.
- [ ] 5.3 Default available Feeds and Web to selected, default all five professional sources to unselected, disable unavailable sources with explanations, and require at least one available selection.
- [ ] 5.4 Build the unified result list with primary-origin and all-source labels, professional identifiers, Feed reader actions, isolated external-link actions, and partial-error recovery.
- [ ] 5.5 Implement desktop source rail and narrow-screen filter drawer behavior with native labeled controls, keyboard focus, live status announcements, and no horizontal overflow.
- [ ] 5.6 Add component tests for explicit submission, defaults/fallbacks, source combinations, validation, source states, result actions, merged provenance, focus restoration, accessibility, and responsive filters.

## 6. End-to-End Verification and Rollout

- [ ] 6.1 Add end-to-end tests for Feed-only, Web-only, each professional adapter, combined, no-results, zero-source, rate-limit, timeout, malformed/off-domain HTML, duplicate precedence, fixed caps, and partial-result flows.
- [ ] 6.2 Verify the real desktop and mobile browser flows for keyboard navigation, focus order, screen-reader labels, contrast, external-link isolation, partial failures, and Feed reader return focus.
- [ ] 6.3 Run OpenSpec strict validation, HarnessKit fast/targeted verification, type checking, lint, focused unit/integration tests, Compose validation, and the Search E2E suite; record unrelated pre-existing failures separately.
- [ ] 6.4 Document Reporting SearXNG deployment, pinned image, secret generation, loopback port, engine allowlist, proxy/health behavior, source adapters, rate limits, privacy, parser breakage handling, and rollback.
- [ ] 6.5 Roll out disabled by default, enable a pilot fund only after SearXNG and all five professional sources pass health/contract checks, monitor latency/error/result-count signals, and define broader enablement criteria.
