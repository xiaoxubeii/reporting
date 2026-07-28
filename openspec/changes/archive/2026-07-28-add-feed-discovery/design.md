## Context

Reporting currently treats Miniflux as the source of truth for personal feeds and for one read-only public Explore collector. The application can list public categories, sources, latest entries, and entry details, but intentionally has no article persistence, semantic analysis, clustering, Trending, or Deal Signal layer. Deals enter through email, public submission, Heartbeat, or the existing admin manual form; the manual form creates a synthetic inbound email and then reuses `processDeal`, dedupe, `inbound_deals`, and Deal Research.

This change adds a fund-scoped derived-intelligence layer over the shared public collector only. Public source articles remain in Miniflux; Reporting persists bounded fund-owned references, hashes, structured AI outputs, and strategy results. The existing Croner process is the scheduler. The feature must work across configured AI providers without exposing credentials or untrusted article instructions to tools, and it must preserve old discovery results during temporary Miniflux or provider failures.

## Goals / Non-Goals

**Goals:**

- Analyze each unique public Explore article once per semantic-model version and cache reusable entities, concepts, events, confidence, provenance, and evidence.
- Use the shared enrichment output for two strategy implementations with separate semantics: deterministic Trending and evidence-gated Deal Signals.
- Present `Latest / Trending / Deal Signals` in the existing Explore surface with transparent ranking/explanation and bounded stale-state behavior.
- Allow a user with Deal-create access to prefill and confirm the existing manual Deal form from either a public/personal article or an eligible Deal Signal.
- Keep refresh idempotent, bounded, observable, and safe to retry through the existing Croner runtime.

**Non-Goals:**

- Fund-thesis fit, fund-specific ranking, or per-user recommendations.
- Background processing of personal subscriptions, read state, saved state, or behavioral signals.
- Automatic Deal creation, automatic Deal Research without confirmation, or a second Deal intake pipeline.
- Training/fine-tuning a custom model, vector embeddings, pgvector clustering, web search, or model tool use.
- Mirroring complete article bodies or replacing Miniflux as the article/state owner.

## Decisions

### 1. Use one shared enrichment layer and two strategy modules

The pipeline is:

```text
public Miniflux collector
  -> normalize/hash/dedupe
  -> SemanticTagger
  -> cached article enrichment
      -> TrendingStrategy
      -> DealSignalStrategy -> DealSignalClassifier
  -> materialized discovery items
  -> authenticated Explore API/UI
```

`SemanticTagger` produces a strict, versioned schema containing normalized companies, people, investors, industries, technologies, geographies, events, evidence, and confidence. `TrendingStrategy` aggregates only validated tags and deterministic source/time data. `DealSignalStrategy` prefilters likely funding opportunities and invokes a separate strict classifier for opportunity status and evidence. The two logical AI models may use the same configured provider/model, but their prompts, schemas, versions, and stored outputs remain independent.

Alternative considered: let each strategy read raw articles independently. Rejected because it duplicates AI cost, makes labels inconsistent, and prevents future strategies from reusing a stable semantic layer.

### 2. Resolve the execution subject's own fund provider

Discovery results are fund-scoped. Authenticated reads obtain `fundId` from the existing route gate, while scheduled work obtains it from a signed, persisted background-job context. A strict resolver reads exactly that execution fund's settings and rejects database errors, missing settings, unknown defaults, missing/decryption-failed credentials, and Ollama without falling back to Anthropic or another fund. It reuses the existing encrypted provider implementations for Anthropic, OpenAI, Gemini, and the generic Custom/OpenRouter OpenAI-compatible provider. No `FEED_DISCOVERY_AI_FUND_ID` or other Discovery-specific provider environment variable exists.

Custom/OpenRouter continues to require an HTTPS Base URL without URL credentials, query, or fragment; DNS must resolve only to public addresses; the provider revalidates connections and rejects redirects. The worker uses plain `createMessage`, bounded tokens, no tools, no web search, and no request-controlled model, endpoint, parameters, or fund identity. Invalid configuration causes a sanitized controlled refresh failure while existing materialized results remain available.

The provider factory returns a secret-free configuration fingerprint derived from provider type, model, and provider-specific behavior inputs such as the validated Custom Base URL and request parameters. Discovery combines that fingerprint with prompt/schema versions inside already fund-scoped rows. A provider, model, endpoint, or request-parameter change resets only that fund's bounded resumable scan and backfills new enrichments/classifications while its prior generation remains active; API keys are never included in fingerprints or logs.

Alternative considered: pick one environment-configured or first available fund. Rejected because deployment configuration/database ordering cannot define tenant credential ownership and would charge one fund for every tenant. Fund-scoped enrichment duplicates provider interpretation work for shared public facts, but it is required to honor provider ownership and prevent cross-fund credential/cost attribution. This remains non-personalized: every member of one fund sees the same deterministic results for that fund.

### 3. Persist derived references and outputs, not article bodies

Add service-role-only tables and RPCs:

- `explore_article_enrichments`: fund ID, collector entry ID/reference, content hash, canonical/source metadata needed for provenance, processing status, semantic output, model/version/usage metadata, retry metadata, timestamps, and expiry. Full article content is not stored.
- `explore_article_deal_classifications`: fund ID and an independent lifecycle for Deal Signal prompt/schema/version/output/usage/retry state, linked to a same-fund enrichment but reusable only within that fund by content hash and classifier version.
- `explore_discovery_items`: fund-scoped immutable generation `trending` or `deal_signal` rows with a stable result key, title/summary, deterministic score, source entry references, evidence/metadata, strategy version, generated/updated/expiry timestamps.
- `explore_discovery_refresh_state`: one row per fund containing the atomic lease, incremental ID/change watermarks, the durable changed-scan entry-ID cursor and fixed scan-start cutoff, target semantic/classifier versions, active generation, and sanitized last-attempt/last-success/error metadata.
- Service-role-only claim, finish, and publish RPCs atomically enforce lease ownership and switch the active generation only after a complete result set has been staged.

Miniflux remains authoritative for article content and detail. The refresh job reads current bounded content, then discards it after validated outputs are persisted. A unique collector-entry constraint plus content hash and version fields make retries idempotent. A successful semantic or Deal-classifier result may be copied to a syndication entry with the same normalized content hash and matching model version without another AI call, while retaining the new entry/source provenance. Failed entries remain addressable for bounded retry; the highest processed entry ID is not the only retry source.

Authenticated users do not query these tables directly. RLS is enabled, grants are explicit, anon/authenticated access is revoked, and service-role access is used only behind reviewed API routes.

Alternative considered: one generic JSON table for everything. Rejected because semantic processing, Deal classification, retry, model provenance, refresh ownership, atomic publication, and expiry have different invariants. Four focused tables are the smallest structure that preserves those boundaries with the existing PostgREST/Supabase architecture.

### 4. Extend Miniflux reads for bounded incremental processing

Extend the existing typed Miniflux entry query with server-controlled order/direction plus `after_entry_id`, `changed_after`, and published-time bounds. The refresh service reads new IDs in ascending fixed-size pages and separately reconciles recently changed entries so edits to an older ID are not missed. Because Miniflux orders the changed scan by entry ID rather than change time, continuation uses `after_entry_id` together with the unchanged `changed_after` watermark instead of an offset into a live result set. The first page persists one fixed scan-start cutoff; every continuation keeps it unchanged. Only a fully exhausted scan advances the change-time watermark to that original cutoff and resets both the ID cursor and cutoff. A lower-ID entry changed while a scan is in progress therefore remains newer than that cutoff and is collected by the next scan. It enforces a per-run article cap and content-length cap and verifies that every source/category belongs to the configured public collector.

Croner invokes one `CRON_SECRET`-authenticated scheduler route on a fixed schedule. The scheduler enqueues idempotent system jobs for eligible funds; the existing background-job dispatcher invokes a signed internal worker whose verified context supplies `fundId`. The worker atomically claims that fund's time-bounded database lease by UUID; only the matching fund and lease holder can advance watermarks, record completion, or publish a new generation. Same-fund overlaps skip harmlessly while different funds remain independent. No browser or Cron query parameter may select a fund.

### 5. Treat semantic outputs as untrusted structured data

Article title, summary, body, author, and publisher text are delimited as untrusted evidence. System prompts explicitly prohibit following article instructions. Outputs are accepted only after exact schema validation, enum/length/count bounds, URL/domain normalization, confidence bounds, and evidence verification against normalized source text. Unknown fields are discarded and malformed output receives at most one strict retry before a bounded failed state.

No model output can select a route, provider, model, endpoint, SQL expression, UI HTML, or Deal action. UI renders derived text as plain React text. Evidence is a short source-grounded excerpt, not generated prose. Provider/model/version and token usage are recorded for audit and cost inspection.

### 6. Keep Trending deterministic and explainable

Trending candidates are normalized concept/event keys from semantic enrichments. Articles are grouped by stable type/label keys; a normalized content hash counts once for volume while distinct collector source references count once for source diversity. Version `trending-v1` uses a 24-hour current window and the immediately preceding seven-day baseline. A candidate requires at least two current-window content hashes and two sources.

The score is a versioned pure function over those metrics. Current rate is the 24-hour count; prior rate is baseline count divided by seven; growth is `(currentRate - priorRate) / priorRate`, floored at zero, or the current count when the prior rate is zero. The 0–100 score is `40% * min(sourceCount / 5, 1) + 30% * min(growth / 5, 1) + 20% * min(currentCount / 10, 1) + 10% * max(0, 1 - newestAgeHours / 24)`, rounded to two decimals. Results sort by score, source count, and current count descending, then normalized label ascending. Metadata exposes every input so the UI can explain the result. AI never supplies the final score.

### 7. Gate Deal Signals on explicit open-opportunity evidence

The common enrichment layer identifies funding/startup events. A deterministic keyword/event prefilter limits the second AI call. `DealSignalClassifier` returns bounded fields including company name/domain, signal type (`active_raise`, `completed_financing`, `fund_launch`, `momentum`, `acquisition`, `noise`), opportunity status (`open`, `closed`, `unknown`, `not_applicable`), stage, amount, event date, confidence, and evidence excerpts. Classifier state is persisted independently from semantic enrichment so its prompt/schema/version can retry or roll forward without re-tagging the article.

A pure policy gate publishes an actionable signal only when:

- signal type is `active_raise`;
- opportunity status is `open`;
- confidence meets the configured code-owned threshold;
- at least one verified source excerpt explicitly supports current/future fundraising;
- the article is inside the code-owned freshness window; and
- the article has a normalized company identity suitable for deterministic deduplication.

Completed financing, closed rounds, and unknown status are not shown as open Deal Signals. Momentum may be retained as non-actionable metadata for future work but is not published in this MVP. Multiple articles about one company/round are collapsed by normalized domain/name plus event window; source diversity increases evidence, not investability. Existing Deal state decorates the same fund's API results only; it never determines publication.

### 8. Publish one API contract with strategy-specific DTOs

Add an authenticated Feeds read route with a code-owned `kind` enum, bounded offset pagination, active-generation metadata, and no client-supplied scoring/model controls. The service returns a tagged union:

- Trending: stable ID, label/title, summary, score, metrics, timestamps, and representative source entries.
- Deal Signal: stable ID, extracted company/round/amount, open status, confidence, evidence, timestamps, representative source entries, and `existingDealId` decoration for the caller's fund.

The route uses the existing Feeds feature gate and rate-limit/error envelope. Stale-but-valid results include `generatedAt` and `isStale`; refresh errors are logged server-side without leaking provider or source details.

### 9. Reuse one shared Deal dialog with explicit prefill

Extract the private Deals-page `NewDealDialog` into a shared component with a bounded `initialValues` contract and reset behavior keyed to a stable prefill ID. Feeds and Explore pass title, safe HTTP(S) URL, company fields when available, and a plain-text pitch containing bounded source metadata plus article summary/content. Missing founder name/email remain required user inputs.

The action is rendered only for callers with existing Deal-create access. Submission remains multipart to `/api/deals/manual`; the current validation, synthetic email, `processDeal`, prior-deal matching, `inbound_deals` insertion, and Deal Research trigger remain unchanged. Successful creation returns the current Deal ID and allows navigation to `/deals/<id>`.

### 10. Preserve last-known-good results and bound retention

Refresh stages a complete immutable generation from validated persisted enrichments, then calls one database RPC that verifies lease ownership and atomically switches `active_generation_id`. API reads only that generation. A partial Miniflux, AI, or persistence failure leaves the old active generation untouched; incomplete generations are invisible and are cleaned up later. When semantic or Deal classifier versions change, the worker backfills the target versions while continuing to serve the old generation and publishes only after every relevant retention-window entry is ready. Enrichments and results have code-owned retention windows and cleanup runs as part of refresh. The API distinguishes empty, unavailable, and stale states without exposing raw errors.

## Risks / Trade-offs

- **Prompt injection or fabricated evidence** -> no tools/web access, strict schemas, bounded plain-text inputs, exact evidence-grounding checks, plain-text rendering, and deterministic action gates.
- **Fund AI credential and cost attribution** -> fund ID comes only from verified route/job context, existing encrypted key storage, admin-controlled provider settings, per-fund run/article/token caps, configuration-fingerprinted caching, usage metadata, and no per-read AI calls.
- **Custom Provider SSRF or redirect abuse** -> reuse the existing HTTPS-only public-address DNS validation, connection-time validation, and redirect rejection; exclude Ollama and never accept a fund/provider/model/endpoint from requests.
- **Missed early opportunities** -> Deal Signals do not require Trending or multiple sources; singleton public articles can pass the open-opportunity gate.
- **Completed financing shown as investable** -> separate signal/status enums, explicit current/future evidence, code-owned freshness, and a hard gate outside the model.
- **Miniflux/provider outage** -> last-known-good materialization, bounded retry metadata, stale response semantics, and no mutation of collector state.
- **Duplicate or unstable trends** -> normalized tag keys, exact/near duplicate suppression, source diversity threshold, versioned deterministic formula, and stable result keys.
- **Copyright/data retention** -> no full article body persistence; store bounded structured outputs, short evidence excerpts, hashes, public URLs, and source references with expiry. Application-side source-reference JSON is capped at 60 KB so PostgreSQL `jsonb::text` separator formatting remains safely inside the 64 KiB database constraint. The complete generation is deterministically interleaved by strategy and capped at 500 items and 900 KB before the 1 MiB atomic RPC boundary.
- **Multi-tenant leakage** -> every derived table, lease, query, cache lookup, and publish RPC is fenced by `fund_id`; the public collector input is shared but provider-derived output is never cross-fund.

## Migration Plan

1. Add service-role-only derived tables, constraints, indexes, grants/RLS, and generated TypeScript types without enabling the scheduler or UI.
2. Add parser, enrichment, ranking, gate, and refresh services with contract tests and a disabled-by-missing-config deployment provider.
3. Add the authenticated read API, Cron route, route declarations, and Croner manifest entry; verify one-shot idempotent refresh against fixtures/local services.
4. Add Explore tabs/cards and extract the shared Deal dialog with prefill; keep `Latest` as the default.
5. Verify each eligible fund's existing default encrypted provider (including validated Custom/OpenRouter when selected) and run an initial bounded fund-scoped backfill before enabling scheduled jobs.
6. Verify desktop/mobile authenticated browser flows, stale/error states, Deal prefill, and the real `/api/deals/manual` path.

Rollback disables/removes the Croner manifest entry and UI tabs first; Latest Explore and manual Deals remain functional. Derived tables may remain inert for forensic inspection or be removed by a separate forward migration after retention expires. No Miniflux or inbound Deal rollback is required because the feature never mutates collector state and only user-confirmed Deals use the existing intake path.

## Open Questions

- Exact production retention windows and per-run article/token caps should be selected from observed collector volume before deployment; tests will enforce conservative defaults and hard maximums.
- Eligible funds must configure a supported default AI provider in the existing Settings UI; no additional Discovery provider configuration is required.
