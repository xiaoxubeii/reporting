## Why

Curated Explore currently exposes latest public articles but cannot surface emerging topics or identify actionable investment opportunities, leaving users to inspect every source manually. A shared discovery layer can analyze each public article once, support deterministic Trending and evidence-gated Deal Signals, and hand confirmed opportunities into the existing Deal workflow without touching personal feed state.

## What Changes

- Add fund-scoped, incremental processing of the shared public Explore collector with idempotent watermarks and bounded retention.
- Resolve each execution subject's own fund default AI provider, including the existing validated Custom/OpenRouter provider, from authenticated/background-job fund context without any additional Discovery environment variable.
- Add a versioned AI semantic-enrichment contract that extracts reusable entities, concepts, events, confidence, and source-grounded evidence once per unique article.
- Add a deterministic Trending strategy based on article clustering, distinct-source volume, relative growth, and freshness; AI labels may supply grouping dimensions but never determine the trend score.
- Add a Deal Signal strategy that combines deterministic prefiltering, structured AI opportunity classification, and hard policy gates so completed financing is not presented as an open investment opportunity.
- Add `Latest / Trending / Deal Signals` views to Explore with provenance, explanation, loading, empty, stale, and failure states.
- Add a `Create Deal` action to eligible signals and ordinary feed articles that opens the existing manual Deal form with trusted article context prefilled, while final creation remains user-confirmed and continues through `/api/deals/manual`.
- Add authenticated refresh and read APIs, scheduled execution through the existing Croner runtime, derived-data migrations, explicit grants/policies, and focused observability.
- Explicitly exclude fund-thesis personalization, personal-feed background scanning, behavior-based ranking, automatic Deal creation, custom-model training, and a second Deal ingestion pipeline.

## Capabilities

### New Capabilities

- `feed-discovery`: Incremental public-feed semantic enrichment, deterministic Trending, evidence-gated Deal Signals, Explore presentation, and user-confirmed promotion into the existing manual Deal workflow.

### Modified Capabilities

<!-- No canonical archived capability is modified; this change composes with the existing unarchived Feeds and Curated Explore changes through a new capability contract. -->

## Impact

- Adds derived PostgreSQL persistence and generated database types while leaving Miniflux authoritative for public and personal feed content/state.
- Adds discovery services under `lib/feeds`, an internal refresh route, an authenticated Explore discovery API, and one Croner manifest entry.
- Uses each fund's existing encrypted server-side AI provider for schema-constrained enrichment/classification of untrusted article text and therefore requires fund-scoped persistence, prompt-injection containment, output validation, Custom Provider SSRF controls, rate/cost bounds, configuration-fingerprinted versioning, and audit metadata.
- Extends the existing Explore and feed-reader UI plus the current manual Deal dialog/prefill boundary; existing Deal analysis, dedupe, insertion, and Research behavior remain authoritative.
- Requires full database, API/access, deterministic-algorithm, AI-parser, scheduler, UI, security, build, and authenticated browser verification.
