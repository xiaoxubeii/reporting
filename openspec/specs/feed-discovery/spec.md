# feed-discovery Specification

## Purpose
TBD - created by archiving change add-feed-discovery. Update Purpose after archive.
## Requirements
### Requirement: Public Explore-only discovery scope
The system SHALL process only entries owned by the configured public Explore collector and SHALL NOT read, copy, rank, or derive signals from personal subscriptions, personal categories, read state, saved state, or user behavior.

#### Scenario: Scheduled discovery refresh
- **WHEN** the authenticated discovery refresh job runs
- **THEN** it reads bounded entries from the configured public collector and performs no personal Miniflux request or mutation

#### Scenario: Untrusted collector reference
- **WHEN** an entry, source, or category reference cannot be revalidated as owned by the configured public collector
- **THEN** the system rejects or skips it without persisting an enrichment or discovery item

### Requirement: Incremental and idempotent processing
The system SHALL process public entries incrementally with bounded pages and per-run limits, reconcile edits to older entry IDs using a changed-time watermark plus a durable entry-ID cursor and fixed scan-start cutoff, cache results by collector entry plus reusable content hash/model version, and make repeated or overlapping refreshes safe through an atomically fenced lease.

#### Scenario: Unchanged entry is encountered again
- **WHEN** a refresh encounters an entry whose content hash and semantic-model version already have a successful enrichment
- **THEN** the system reuses the cached enrichment without another semantic AI request

#### Scenario: Entry content or model version changes
- **WHEN** an existing collector entry has a new normalized content hash or the configured semantic-model version changes
- **THEN** the system produces and stores a new validated enrichment before rebuilding discovery results

#### Scenario: Older entry is edited
- **WHEN** Miniflux reports a changed time newer than the stored change watermark for an entry whose ID is below the ID watermark
- **THEN** the system revalidates its collector ownership and content hash instead of permanently skipping the edit

#### Scenario: Changed-entry reconciliation spans multiple ID-ordered pages
- **WHEN** a changed-entry scan is not exhausted in one bounded run
- **THEN** the system retains the prior change-time watermark, persists the last scanned entry ID and the first page's fixed scan-start cutoff, resumes with both `changed_after` and `after_entry_id`, and advances the time watermark to that original cutoff only after the scan is exhausted

#### Scenario: Syndicated article has identical content
- **WHEN** another collector entry has the same normalized content hash and exact semantic or classifier version as a successful result
- **THEN** the system reuses the bounded AI output without another model request while preserving the new entry and source provenance

#### Scenario: Refresh overlaps
- **WHEN** a second refresh starts while the same fund's refresh lease is held
- **THEN** the second refresh returns a successful skipped result and does not duplicate AI calls or discovery rows, while another fund remains independently refreshable

### Requirement: Versioned fund-owned semantic enrichment
The system SHALL use the execution subject's own fund default encrypted AI provider to transform each unique public article into a strict, versioned fund-scoped semantic record containing bounded entities, concepts, events, confidence, provenance, evidence, model identity, and usage metadata. The fund ID SHALL come from the authenticated route gate or verified background-job context and SHALL NOT require a Discovery environment variable. The worker SHALL support the existing Anthropic, OpenAI, Gemini, and validated Custom/OpenRouter providers, reject Ollama, and SHALL NOT accept a caller-supplied fund, provider, model, endpoint, or request parameters.

#### Scenario: Valid fund Custom Provider
- **WHEN** the execution subject's fund selects a complete Custom/OpenRouter provider whose HTTPS endpoint passes the existing public-address and redirect-rejection controls
- **THEN** the worker decrypts the fund credential server-side, uses the configured model and validated provider behavior, and exposes no secret or endpoint control to the discovery API

#### Scenario: Provider configuration changes
- **WHEN** that fund's provider, model, validated Custom Base URL, or Custom request parameters change
- **THEN** the system derives new bounded semantic and classifier versions from a secret-free configuration fingerprint, resets a bounded resumable scan, and backfills without replacing the prior active generation until the new version is complete

#### Scenario: Unsafe provider configuration
- **WHEN** the verified execution fund's settings or key cannot be resolved, its default is Ollama, or its Custom Provider endpoint fails validation
- **THEN** that fund's refresh fails closed with a sanitized error, makes no fallback to another fund or provider, and preserves only that fund's last-known-good generation and prior safe watermarks

#### Scenario: Valid semantic response
- **WHEN** the model returns a schema-valid response with evidence found in the normalized article text
- **THEN** the system stores the bounded semantic record without storing the complete article body

#### Scenario: Malformed or ungrounded semantic response
- **WHEN** the model response is malformed, exceeds schema bounds, contains unsupported enum values, or cites evidence not found in the article
- **THEN** the system rejects the response, performs at most one strict retry, and records a bounded retryable failure without publishing its tags

#### Scenario: Article contains instructions
- **WHEN** article text attempts to direct the model, select tools, reveal secrets, or alter the output contract
- **THEN** the system treats that text only as untrusted evidence, invokes no tools or web search, and accepts only the fixed validated schema

### Requirement: Deterministic Trending strategy
The system SHALL calculate Trending v1 over a 24-hour current window and the immediately preceding seven-day baseline, require two unique current-window content hashes and two distinct sources, and apply the documented deterministic weighted source-diversity, growth, volume, and freshness formula; AI output SHALL NOT directly supply or override the final trend score.

#### Scenario: Topic meets trend publication thresholds
- **WHEN** a normalized topic has the required current-window volume and at least two distinct public sources
- **THEN** the system publishes one stable Trending item with its score, article count, source count, growth, freshness, window, and representative source references

#### Scenario: Topic has only one source
- **WHEN** a topic is mentioned repeatedly by only one public source
- **THEN** the system does not publish it as Trending regardless of article count

#### Scenario: Same metrics are recalculated
- **WHEN** the strategy receives identical normalized metrics and strategy version
- **THEN** it produces the same stable key, two-decimal score, ordering by score/source count/article count/normalized label, and explanation metadata

### Requirement: Independent Deal Signal classification
The system SHALL prefilter likely opportunity articles from common semantic tags and bounded text, then use a separately persisted and versioned strict Deal Signal classifier to return company, signal type, opportunity status, round, amount, event date, confidence, and source-grounded evidence.

#### Scenario: Explicit open fundraising opportunity
- **WHEN** an article explicitly states that a company is currently or prospectively raising capital and the classifier returns `active_raise` with `open` status and grounded evidence
- **THEN** the system evaluates it with the deterministic Deal Signal publication gate

#### Scenario: Completed financing announcement
- **WHEN** an article states that financing was raised, secured, closed, announced as completed, or led by named investors
- **THEN** the system classifies or gates it as completed/closed and does not publish it as an actionable Deal Signal

#### Scenario: Opportunity status is unknown
- **WHEN** the article describes company momentum or a financing event but does not explicitly establish that investment remains open
- **THEN** the system does not infer a future raise and does not publish an actionable Deal Signal

### Requirement: Deterministic Deal Signal gate and deduplication
The system SHALL publish a Deal Signal only when code-owned rules confirm an `active_raise`, `open` status, minimum confidence, grounded open-opportunity evidence, and freshness, and SHALL collapse duplicate company/round reports without treating source volume as investability.

#### Scenario: Candidate passes every gate
- **WHEN** a fresh candidate passes every required gate
- **THEN** the system publishes one Deal Signal with explicit evidence, confidence, extracted fields, timestamps, and representative source references

#### Scenario: Candidate fails any hard gate
- **WHEN** signal type, opportunity status, confidence, evidence grounding, or freshness fails its code-owned threshold
- **THEN** the system omits the candidate from the actionable Deal Signals response

#### Scenario: Multiple sources report the same open round
- **WHEN** multiple articles resolve to the same normalized company and financing event window
- **THEN** the system publishes one Deal Signal containing multiple source references without increasing its open-opportunity status

### Requirement: Fund-scoped last-known-good derived persistence
The system SHALL persist bounded enrichments, independent Deal classifications, immutable discovery generations, and refresh state under an explicit `fund_id`; retain only code-owned metadata and short evidence excerpts; and publish each fund's complete generation with one fund-and-lease-fenced database transaction while preserving that fund's previous active generation through transient failures. No fund SHALL read, reuse, overwrite, or publish another fund's provider-derived rows.

#### Scenario: Provider or Miniflux fails during refresh
- **WHEN** a refresh cannot complete because the collector or AI provider is unavailable
- **THEN** the system records a sanitized failure and continues serving unexpired prior results marked stale when applicable

#### Scenario: Persistence fails during generation publication
- **WHEN** staging, validation, or the publish transaction fails before the active-generation switch
- **THEN** the previous active generation remains complete and visible and no partial generation is served

#### Scenario: Model version rolls forward
- **WHEN** the configured semantic or Deal classifier version changes
- **THEN** the system backfills the target version while serving the prior active generation and switches only after every relevant retention-window entry is ready

#### Scenario: Successful refresh produces no items
- **WHEN** a complete refresh legitimately has no Trending or Deal Signal candidates
- **THEN** the system publishes an empty active generation with a success timestamp distinct from never-run or failed states

#### Scenario: Derived data expires
- **WHEN** an enrichment or discovery item passes its code-owned retention deadline
- **THEN** a later refresh removes or expires that derived row without mutating any Miniflux entry or existing Deal

#### Scenario: Direct client database access
- **WHEN** an anonymous or authenticated client attempts direct Data API access to discovery tables
- **THEN** explicit grants and RLS deny access while reviewed server-side service-role paths remain available

#### Scenario: Two funds use different providers
- **WHEN** two funds process the same public collector entry with different provider configurations
- **THEN** each fund retains an independent enrichment, classifier lifecycle, watermark, and active generation without cross-fund overwrite or reuse

### Requirement: Authenticated discovery API
The system SHALL expose an authenticated, Feeds-gated Explore discovery API with an allowlisted strategy kind, bounded limit/offset pagination, active-generation metadata, tagged strategy DTOs, rate limiting, and sanitized error semantics.

#### Scenario: Authorized Trending request
- **WHEN** a Feeds-authorized member requests `trending` with valid bounded pagination
- **THEN** the API resolves the caller's fund from the route gate and returns only that fund's Trending DTOs plus generation/staleness metadata in the existing Feeds response envelope

#### Scenario: Authorized Deal Signals request
- **WHEN** a Feeds-authorized member requests `deal_signal`
- **THEN** the API returns only actionable Deal Signal DTOs and decorates each result with an existing active Deal reference for that member's fund when a normalized company match exists

#### Scenario: Invalid strategy or pagination
- **WHEN** a caller supplies an unknown strategy, excessive limit, invalid offset, scoring control, model control, or endpoint control
- **THEN** the API rejects the request without invoking AI or exposing internal configuration

### Requirement: Explore discovery presentation
The system SHALL present URL-backed `Latest`, `Trending`, and `Deal Signals` views within Explore, keep `Latest` as the default, and provide accessible loading, empty, error, stale, explanation, pagination, desktop, and mobile behavior.

#### Scenario: User switches discovery view
- **WHEN** an authorized user selects Trending or Deal Signals
- **THEN** the URL represents that view, browser navigation restores it, and the corresponding API data replaces Latest without mutating personal or collector state

#### Scenario: Trending explanation
- **WHEN** a Trending card is rendered
- **THEN** it exposes the representative topic and human-readable article count, distinct-source count, growth, freshness, and source provenance without claiming AI chose the ranking

#### Scenario: Deal Signal explanation
- **WHEN** a Deal Signal card is rendered
- **THEN** it exposes company/round/amount when available, the open-opportunity evidence, confidence/provenance, and a clear distinction from completed financing news

### Requirement: User-confirmed Feed-to-Deal handoff
The system SHALL allow an authorized Deal creator to open one shared manual Deal dialog from an ordinary feed article or eligible Deal Signal with bounded source context prefilled, while keeping founder fields user-confirmed and final creation on the existing `/api/deals/manual` path.

#### Scenario: Create Deal from ordinary article
- **WHEN** an authorized user selects `Create Deal` in a personal or Explore article reader
- **THEN** the shared dialog prefills safe article title, URL, summary/content context, leaves unavailable required fields editable, and does not submit automatically

#### Scenario: Create Deal from Deal Signal
- **WHEN** an authorized user selects `Create Deal` on an eligible signal
- **THEN** the shared dialog additionally prefills bounded extracted company, domain, round/amount, evidence, and source references for user review

#### Scenario: User confirms the prefilled form
- **WHEN** the user completes required fields and submits
- **THEN** the system sends the existing validated multipart contract to `/api/deals/manual`, reuses current synthetic-email analysis, dedupe, `inbound_deals`, and Deal Research behavior, and returns the created Deal ID

#### Scenario: Caller lacks Deal-create access
- **WHEN** a Feeds user lacks the existing permission required by `/api/deals/manual`
- **THEN** the UI omits the creation action and the API continues to reject unauthorized direct submissions

### Requirement: Scheduled refresh security and observability
The system SHALL use the existing `CRON_SECRET` scheduler to enqueue bounded fund-scoped Discovery background jobs and SHALL execute refresh only with a verified background-job context containing that job's `fund_id`. Each fund SHALL have an independent expiring lease; only the matching fund and current UUID holder may advance watermarks or publish. The system SHALL enforce hard work limits and emit sanitized structured outcomes without credentials, article bodies, model prompts, or provider responses.

#### Scenario: Croner invokes refresh
- **WHEN** Croner calls the fixed discovery refresh route with the configured bearer secret
- **THEN** the route enumerates eligible funds in bounded pages, idempotently enqueues one system Discovery job per fund/schedule bucket, and returns sanitized enqueue counts without choosing a first or environment-configured fund

#### Scenario: Refresh route is unauthenticated
- **WHEN** the refresh route receives a missing or incorrect bearer secret
- **THEN** it rejects the request before Miniflux, database mutation, or AI invocation

#### Scenario: Work limit is reached
- **WHEN** the configured per-run article, content, token, or time limit is reached
- **THEN** the refresh stops safely, persists completed idempotent work, and leaves remaining entries for a later run
