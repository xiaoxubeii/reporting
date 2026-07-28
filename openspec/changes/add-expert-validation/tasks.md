## 1. Expert Directory and Matching

- [x] 1.1 Enable `pgvector` and add the minimal `experts` table with global/fund scope constraints, ordinary filter indexes, profile text, server-only email access, status, embedding, embedding model metadata, and timestamps; do not add HNSW/IVFFlat.
- [x] 1.2 Add authorized server-side create/update/list/search operations; return redacted directory DTOs without email, enforce global/same-fund visibility, and regenerate an embedding from profile text only when the profile changes.
- [x] 1.3 Configure one fixed embedding provider/model/dimension for the first version and document that runtime switching, stale-vector detection, and automatic re-embedding are not implemented.
- [x] 1.4 Add exact-cosine Top 5 matching from the confirmed sanitized question plus expert profile, with global/same-fund, active, contactable, and non-null embedding filters; do not send context, Deal name, source data, or contact fields to the provider.
- [x] 1.5 Add one shared `manual` / `auto_match` confirmation operation that stores only the chosen expert and snapshot, never auto-invites, and does not persist candidates or matching runs.
- [x] 1.6 Add unit and database tests for cross-fund isolation, redacted global DTOs, server-only email use, embedding failure fallback, exact ordering, Top 5 bounds, manual/automatic selection, and no candidate/run persistence or LLM reranking.

## 2. Persistence and Authorization

- [x] 2.1 Add the `diligence_expert_requests` migration with fund/deal foreign keys, `draft / invited / submitted` state constraints, JSONB source reference/snapshot, bounded validation fields, token hash/expiry, sanitized provider metadata, one bounded immutable response, document linkage, materialization error, indexes, grants, and fund-scoped RLS.
- [x] 2.2 Do not add review fields, Accept/Reject states, a submission receipt, invitation cancel/revoke, or Research freshness fields in the first version.
- [x] 2.3 Add typed models and schema validation for internal mutations and public submissions.
- [x] 2.4 Add unit and database tests for fund isolation, allowed state transitions, invitation expiry/rotation, atomic one-time submission, immutable responses, and one-document materialization.

## 3. Internal Research Workflow

- [x] 3.1 Add an internal create/list/status API that resolves the current user's Diligence write access and validates the referenced Deal and selected source array item.
- [x] 3.2 Persist `source_ref` as the source draft, optional Research job, source kind, source index, and immutable source snapshot so later Research overwrite does not erase provenance.
- [x] 3.3 Add structured AI generation through the existing Fund-configured provider for one sanitized question, one expert profile, and one sanitized context snapshot; allow editing, confirmation, and complete manual fallback without modifying `research_output`.
- [x] 3.4 Add the Research-page request/status UI without creating Attention or Q&A records.
- [x] 3.5 Add manual directory search and Auto match Top 5 selection, requiring internal confirmation before invitation.
- [x] 3.6 Move the request/status UI to a dedicated Expert Validation workspace tab immediately after Research without adding a new `DiligenceStageBar` or backend pipeline stage.

## 4. Invitation and Public Submission

- [x] 4.1 Add 32-byte token generation, SHA-256 storage, fragment URL issuance, expiry, and conditional initial `draft -> invited` issuance; only the winning concurrent request may send its token.
- [x] 4.2 Add conditional reissue for invited, unsubmitted requests so only one concurrent rotation wins; do not add revoke/cancel in the first version.
- [x] 4.3 Add an HTML-escaped minimal invitation template and send through the existing Fund `system` email provider; record provider acceptance separately from credential issuance and persist only sanitized bounded provider errors without token, URL, or request payload.
- [x] 4.4 Add JSON POST resolve/submit APIs with content-type and size validation, generic non-enumerating errors, IP limits, and token-hash/HMAC rate-limit keys; never pass raw tokens or invitation URLs to logs, telemetry, or rate-limit storage.
- [x] 4.5 Add a minimal public response page that synchronously clears the fragment before other application code, keeps the token only in memory, shows one text area, and locks after submission.
- [x] 4.6 Exclude the public route from Vercel Analytics, Speed Insights, Fathom, Google Analytics, and other third-party scripts; add route-specific restrictive CSP plus browser/CDN `no-store` headers for the page and token APIs.
- [x] 4.7 Add focused tests for valid, expired, rotated, duplicate, concurrent, oversized, and invalid tokens; concurrent issue/reissue; provider success/failure; sanitized errors; HTML escaping; no-cookie/no-storage behavior; no analytics; restrictive CSP; no-store; and non-enumerating errors.

## 5. Automatic Evidence Materialization

- [x] 5.1 On a valid submission, atomically store the bounded response and `submitted_at`, transition `invited -> submitted`, and immediately invoke the shared idempotent materializer without Accept/Reject.
- [x] 5.2 Implement deterministic `{dealId}/expert-validation/{requestId}.md` private storage; preserve the original answer, omit expert contact fields from the artifact, write once, and never overwrite it from the expert workflow.
- [x] 5.3 Create or reuse one `industry_expert` Diligence document, link it to the request, and call `enqueueIngestForDocuments` with the explicit document ID; skip enqueue when already parsed and preserve truthful pending state when another Deal job is active.
- [x] 5.4 Add an authorized internal `Retry evidence processing` operation that invokes the same materializer for a submitted request with missing evidence steps and does not introduce an approval state.
- [x] 5.5 Harden the Ingest prompt boundary so expert document content cannot close its container or override model instructions; explicitly treat document instructions as untrusted evidence.
- [x] 5.6 Add integration and failure-injection tests for failure after storage upload, document insert, request link, and enqueue attempt; assert one immutable object, one document, one request link, safe retry behavior, and a prompt-injection response remaining data rather than instructions.

## 6. Existing Pipeline Reuse

- [x] 6.1 Verify explicit-document Ingest retains merge semantics and continues to enqueue existing `ingest_synthesis` and checklist assessment follow-ups.
- [x] 6.2 Preserve the existing manual `Run research` / `Re-run research` action without automatic execution, Research versions, expert-specific results, or a new expert-evidence freshness calculation or banner.
- [x] 6.3 Add regression tests proving Claims verification continues to read all Ingest documents, competitors retains its current claim filtering, founders retains its current `team_bio` / `pitch_deck` filtering, and Research overwrites the single current `research_output`.
- [x] 6.4 Verify accepted terminology is absent: a submitted expert response flows through the existing Ingest, synthesis, checklist, Research, Scoring, and Memo chain without a Review/Accept/Reject step or expert-specific worker.

## 7. Security and End-to-End Verification

- [x] 7.1 Review internal and public routes for Diligence write authorization, fund scoping, input limits, token leakage, replay, enumeration, XSS, prompt injection, caching, analytics leakage, contact privacy, and sensitive errors.
- [x] 7.2 Run fast and targeted HarnessKit verification plus focused unit and integration tests.
- [x] 7.3 Run the real browser flow from both a Research gap and a contradiction through request creation, expert selection, invitation, the public response page, one-time submission, automatic document materialization, incremental Ingest enqueue, and visibility of the existing manual Research action. Local AI processing itself remains owned by the existing worker and requires a configured provider/cron environment.
- [x] 7.4 Confirm that no expert account, LP identity, internal review state, Attention item, Q&A message, Research freshness record, Research version, or expert-specific Research result is created.
