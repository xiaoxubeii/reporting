## 1. Contracts and Data Model

- [x] 1.1 Add failing migration-contract tests for service-role-only enrichment/classification/result/state tables, constraints, indexes, bounded payloads, retention fields, RLS, and explicit grants
- [x] 1.2 Add the forward migration for the four discovery tables, atomic lease/publish RPCs, active-generation switch, and typed database contracts
- [x] 1.3 Add bounded immutable TypeScript contracts and runtime validators for semantic enrichment, Deal classification, Trending items, Deal Signals, refresh summaries, and API payloads
- [x] 1.4 Add deployment-owned discovery AI configuration validation and document the supported provider/model/key boundary in `.env.example`

## 2. Collector and Semantic Enrichment

- [x] 2.1 Add failing Miniflux-client tests for ascending `after_entry_id`, `changed_after` reconciliation of older IDs, and hard page bounds without collector-state mutation
- [x] 2.2 Extend the Miniflux client and Explore collector service with ownership-validated bounded incremental entry reads
- [x] 2.3 Add failing semantic parser/prompt tests for schema bounds, unknown enums, evidence grounding, instruction-like article text, strict retry, and model/version caching
- [x] 2.4 Implement the deployment AI provider resolver and `SemanticTagger` with no tools/web search, bounded input/output, usage metadata, and sanitized failures
- [x] 2.5 Implement enrichment and independent Deal-classification persistence/reuse/retry behavior keyed by collector entry, with cross-entry reuse by content hash and exact model version

## 3. Trending and Deal Signal Strategies

- [x] 3.1 Add failing pure-function tests for the exact 24-hour/seven-day formula, tag normalization, duplicate suppression, stable keys, source diversity, growth/freshness metrics, deterministic score, and stable ordering
- [x] 3.2 Implement the versioned deterministic `TrendingStrategy` and transparent metric/explanation metadata
- [x] 3.3 Add failing Deal classifier/parser tests for open, completed, closed, unknown, momentum, malformed, ungrounded, stale, and duplicate-company cases
- [x] 3.4 Implement deterministic Deal prefiltering plus the independently versioned structured `DealSignalClassifier`
- [x] 3.5 Implement the pure Deal publication gate and company/round deduplication without using source volume as investability
- [x] 3.6 Implement immutable generation staging, atomic last-known-good publication, bounded cleanup, and per-fund existing-Deal decoration

## 4. Refresh and API Boundaries

- [x] 4.1 Add failing refresh tests for `CRON_SECRET`, atomic lease ownership, ID/change watermarks, durable changed-scan pagination, per-run caps, incremental reuse, version backfill, partial failure, retry, active-generation preservation/switch, aggregate counters, and sanitized logs
- [x] 4.2 Implement the discovery refresh orchestrator, atomic publish RPC integration, and authenticated `/api/cron/feeds-discovery` route
- [x] 4.3 Add the fixed Croner manifest entry and update manifest/entrypoint tests for the new schedule and job count
- [x] 4.4 Add failing API/access tests for Feeds authorization, kind allowlist, bounded limit/offset pagination, tagged DTO separation, active-generation/stale metadata, rate limiting, existing-Deal decoration, and no client model/scoring controls
- [x] 4.5 Implement `GET /api/feeds/explore/discovery`, register route access/ungated Cron ownership, and preserve the existing Feeds error envelope

## 5. Explore and Feed-to-Deal UI

- [x] 5.1 Read and apply the repository frontend design/accessibility skills, then add failing component/locale tests for URL-backed `Latest / Trending / Deal Signals`, state panels, explanations, provenance, and desktop/mobile semantics
- [x] 5.2 Implement Explore discovery tabs, Trending cards, Deal Signal cards, pagination, stale/loading/empty/error states, and reader/source actions using existing design-system components
- [x] 5.3 Add failing tests for a shared manual Deal dialog with stable prefill/reset behavior, safe URL/text bounds, required founder fields, access-based action visibility, and existing multipart submission
- [x] 5.4 Extract the existing Deals-page dialog into a shared component and add bounded prefill from personal articles, Explore articles, and eligible Deal Signals
- [x] 5.5 Wire successful creation to the existing `/api/deals/manual` response and Deal detail navigation without changing `processDeal`, dedupe, insertion, or Research contracts
- [x] 5.6 Add complete English and Simplified Chinese messages and verify keyboard/focus, responsive layout, and plain-text rendering of untrusted derived content

## 6. Verification and Evidence

- [x] 6.1 Run migration/schema checks, strict OpenSpec validation, route/scheduler contracts, bootstrap-marker guard, JSON validation, and `git diff --check`
- [x] 6.2 Run focused discovery/Feeds/Deals tests, changed-file lint, TypeScript, the full relevant test suite, and production build; record any proven pre-existing blockers separately
- [x] 6.3 Run correctness, security, and UI/UX reviews; resolve every in-scope blocker/high finding and re-run affected checks
- [x] 6.4 Run one real Croner-to-refresh path and verify idempotent counters plus service-role-only persistence without personal Miniflux access
- [x] 6.5 Verify the real authenticated desktop/mobile browser flow for Latest, Trending, Deal Signals, stale/error/empty behavior, ordinary-article prefill, Signal prefill, and user-confirmed manual Deal creation
- [x] 6.6 Update HarnessKit feature state/progress/evidence with changed files, commands, architecture-path proof, browser evidence, residual risks, and completion audit

## 7. Fund-Owned Custom Provider Runtime

- [x] 7.1 Add failing tests for explicit verified-fund provider resolution, no request/first-fund/Anthropic fallback, supported fund defaults, explicit Ollama rejection, and sanitized provider-resolution failures
- [x] 7.2 Add a secret-free stable provider configuration fingerprint covering provider, model, validated Custom Base URL, and bounded Custom request parameters
- [x] 7.3 Resolve Discovery through the execution fund's existing encrypted provider factory, pass configuration-fingerprinted semantic/classifier versions through refresh/store/materialization, and reset a bounded resumable scan on version change while preserving last-known-good
- [x] 7.4 Remove direct Discovery provider/model/key configuration and reuse each execution fund's encrypted provider settings without copying secrets
- [x] 7.5 Run focused/full tests, strict OpenSpec, TypeScript/build/lint, real Cron refresh against current Supabase/Miniflux/Custom Provider, and unmocked authenticated browser verification

## 8. Remove Fixed Fund Configuration and Scope Discovery to the Execution Fund

- [x] 8.1 Add failing contracts for no `FEED_DISCOVERY_AI_FUND_ID`, explicit verified `fundId` provider resolution, no cross-fund cache/state/result access, and no fallback
- [x] 8.2 Add a forward migration that scopes enrichments, classifications, generations, refresh state, and every claim/finish/publish RPC by `fund_id`, with service-role-only grants and cross-fund database assertions
- [x] 8.3 Thread verified fund context through provider resolution, repository/store/runtime/read services, and ensure configuration changes reset only that fund while preserving its last-known-good generation
- [x] 8.4 Replace the global Cron refresh with bounded per-fund scheduling and verified system background-job execution; remove the Discovery fund environment variable from code, docs, and local configuration
- [x] 8.5 Run focused/full tests, TypeScript/build/lint, strict OpenSpec, isolated migration assertions, real Custom Provider refresh for the authenticated fund, and authenticated cross-fund browser/API verification
