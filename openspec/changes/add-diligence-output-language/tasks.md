## 1. Contract and Data Model

- [x] 1.1 Add focused failing tests for supported-language validation, prompt language directives, draft snapshot resolution, and non-destructive switch decisions
- [x] 1.2 Add the output-language domain module with validated `en` / `zh-CN` parsing and localized deterministic fallbacks
- [x] 1.3 Add and verify the Supabase migration for deal preference, draft snapshot, lineage, constraints, indexes, and existing-row English backfill
- [x] 1.4 Update checked-in database types and fixtures for the additive columns

## 2. Pipeline Propagation

- [x] 2.1 Extend shared system-prompt composition with the high-priority output-language contract and stable machine/evidence rules
- [x] 2.2 Load the authoritative draft snapshot in ingestion, research, checklist/Q&A, score, draft, and render stages
- [x] 2.3 Propagate output language through stage jobs and ensure draft creation snapshots the deal preference
- [x] 2.4 Apply the language contract to expert-validation question generation/synthesis and application-authored narrative fallbacks

## 3. API and Versioning

- [x] 3.1 Accept and validate `output_language` on interactive deal creation while preserving English defaults for omitted values
- [x] 3.2 Add an authorized, idempotent output-language endpoint that updates empty drafts in place or creates a linked draft version after artifacts exist
- [x] 3.3 Return output language and version lineage from the diligence detail/status contracts needed by the UI
- [x] 3.4 Add route and integration tests for invalid input, empty-draft update, generated-draft version creation, finalized preservation, and same-language no-op

## 4. User Experience

- [x] 4.1 Add localized English and Simplified Chinese catalog copy for the single deal-level language control and version confirmation
- [x] 4.2 Default the create-deal flow from the active UI locale with an explicit compact override
- [x] 4.3 Add the accessible responsive deal-header language chip/dropdown without per-stage language controls
- [x] 4.4 Confirm and surface non-destructive language-version creation after generated output exists

## 5. Verification and Review

- [x] 5.1 Run focused unit and integration tests, database/type checks, `git diff --check`, and strict OpenSpec validation
- [x] 5.2 Run TypeScript and changed-file lint/build checks, documenting only confirmed pre-existing blockers
- [x] 5.3 Verify English/Chinese UI, locale-change and finalized-version preservation in the real browser; cover mixed-source generation rules with focused prompt contracts
- [x] 5.4 Complete correctness, accessibility/UX, database, and security review; resolve all critical/high findings
