## Context

The existing expert-validation feature stores formal experts in `experts` with `global` or `fund` scope, searches both scopes for a fund, embeds confirmed profiles for semantic matching, and snapshots the selected identity into a Diligence expert request. It has no directory page, certification/provenance fields, or candidate lifecycle. Adding raw web results directly to `experts` would weaken the existing trust boundary and could expose one fund's sourced people to another fund.

Reporting Search already provides bounded external API transport, deadlines, normalized failures, and a fund-configured allowlist for PubMed and ClinicalTrials.gov. Expert discovery needs person-specific fields that the article/study `SearchCandidate` contract intentionally does not expose, so discovery will reuse those upstream safety primitives while defining a separate expert-domain adapter contract.

## Goals / Non-Goals

**Goals:**

- Make platform-certified and fund-confirmed experts visible as governed resources.
- Let a fund create experts manually or promote source-backed discovery candidates after human confirmation.
- Keep candidates private, auditable, and ineligible for matching or outreach.
- Reuse existing Diligence matching, selection, invitation, and immutable response materialization.
- Provide a real `/experts` workflow with clear origin and verification labels.

**Non-Goals:**

- Automatic platform certification or cross-fund publication of a fund candidate.
- Crawling LinkedIn, guessing email addresses, or contacting a candidate automatically.
- Building a proprietary expert index, marketplace, scheduling, contracting, or payment system.
- Replacing the existing Diligence expert request lifecycle.

## Decisions

### 1. Two formal expert scopes; candidates are not experts

`experts.scope = global` represents a platform-certified resource and `scope = fund` represents a fund-confirmed resource. New fields record `verification_type`, `source_type`, `verified_at`, `verified_by`, and bounded JSON provenance. Existing global rows are backfilled as platform verified; existing fund rows are backfilled as fund confirmed/manual.

Discovery results live in `expert_candidates`, keyed and queried by `fund_id`. This avoids overloading `experts.status` with pre-verification states and guarantees the existing `match_experts` RPC cannot return a candidate.

Alternative considered: store candidates as inactive experts. Rejected because every expert consumer would need a new exclusion rule and an accidental status update could make an unreviewed person eligible.

### 2. Expert-specific discovery adapters over approved API transport

`ExpertDiscoveryAdapter` returns normalized people plus source evidence. The first adapters are:

- PubMed: query ESearch/ESummary, aggregate named authors across relevant publications, and retain PMID/title/URL evidence. PubMed results do not provide a verified email.
- ClinicalTrials.gov: query studies including responsible officials/investigators, retain NCT/title/URL evidence, organization/role when present, and only retain an email explicitly returned by the API.

Both reuse `fetchBoundedApiJson`, deadline behavior, text/date sanitizers, source-policy toggles, and fixed result limits. The service runs only enabled approved adapters and persists a bounded evidence snapshot. Cross-record merging requires a strong explicit identifier such as a source-supplied email; weak name-only identities remain record-scoped so same-name clinicians are not silently collapsed.

Alternative considered: parse authors from the generic Search result snippet. Rejected because snippets are presentation text, truncate authors, and are not a stable identity contract.

### 3. Fund-private, source-backed candidate lifecycle

Candidate states are `pending`, `confirmed`, and `rejected`. Discovery upserts by `(fund_id, fingerprint)` and appends/deduplicates bounded evidence without reviving a rejected candidate. The fingerprint uses an explicit upstream email when available and otherwise a source record plus person position; it is not shown to users. Confirmation and rejection redact candidate email and the exact discovery query while retaining bounded source evidence and review audit fields.

Only the owning fund can list, confirm, or reject a candidate. Discovery and lifecycle routes require an authenticated fund admin, same-origin JSON input, strict length/source bounds, shared rate limiting, and `Cache-Control: no-store`.

### 4. Database-owned, idempotent promotion

A service-role-only PostgreSQL function locks the candidate, validates fund ownership/state, and either returns the already-linked expert or creates one fund expert and marks the candidate confirmed in the same transaction. Confirmation requires a valid explicit email; the fund admin may correct candidate name/title/organization/profile but cannot change its fund or provenance.

After promotion, the application attempts to create the existing expert embedding. Embedding failure is non-destructive and returns the same warning used by manual creation; the expert remains searchable manually until embedding is available.

Alternative considered: a multi-query API transaction. Rejected because a crash between expert insert and candidate update would create ambiguous duplicate state.

### 5. Directory is the resource-control surface; Diligence remains the consumption surface

`/experts` has three views:

- Platform Certified: active global experts, read-only to ordinary funds.
- Fund Experts: active/inactive current-fund experts, manually creatable and editable by fund admins.
- Discovery: query approved sources, inspect pending/rejected/confirmed candidates, confirm or reject.

The existing Diligence panel continues to generate a focused profile, search, auto-match, select, and invite. Directory DTOs add verification/source badges and an Expert Directory link. No candidate appears in that panel until confirmed.

### 6. Platform management remains a privileged boundary

The existing `EXPERT_GLOBAL_ADMIN_FUND_ID` trusted path remains the only application path that may write global experts. This feature exposes global experts to funds but does not add a public platform-admin UI. The schema enforces scope/verification consistency so a fund expert cannot claim platform certification.

## Risks / Trade-offs

- [Author-name ambiguity and changing affiliations] → keep source evidence, require fund confirmation, deduplicate conservatively, and permit field correction before promotion.
- [Public APIs return incomplete contact data] → never infer email; confirmation is disabled until an admin enters and confirms an address.
- [Upstream failure or rate limiting] → return per-source partial statuses and retain already persisted candidates; do not treat partial discovery as certification.
- [Existing global rows were not historically labeled] → backfill them as platform verified because global writes already require the trusted global-admin path, and record the migration timestamp.
- [Embedding provider unavailable] → promotion succeeds with a visible warning; manual search remains available and semantic matching excludes the row until embedding exists.
- [Large candidate evidence] → enforce adapter result limits, per-field bounds, JSON-size bounds, and source-reference deduplication.

## Migration Plan

1. Add expert metadata with backfill and consistency constraints.
2. Add `expert_candidates`, indexes, RLS/service-role grants, and transactional confirmation function.
3. Regenerate database types and deploy backend routes/services before exposing navigation.
4. Deploy directory UI and Diligence badges.
5. Rollback application code first; the additive columns/table can remain safely. A database rollback may drop candidates and metadata only after confirming no newly promoted provenance is needed; formal experts remain valid.

## Open Questions

None for the first release. Platform-admin candidate review, OpenAlex/ORCID enrichment, expert availability, and commercial marketplace capabilities remain future changes.
