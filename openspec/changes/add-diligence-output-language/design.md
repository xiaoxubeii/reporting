## Context

The request-scoped UI locale is intentionally browser-local and the existing UI-localization contract excludes stored, non-interactive AI output. Diligence generation is asynchronous and resumable: deal documents are processed into a sequence of JSON artifacts stored on `diligence_memo_drafts`, while `diligence_deals.current_memo_stage` points at the active workflow. Reading a cookie inside a job would make retries non-deterministic and would not work for imported or service-created deals.

The user-facing model should stay smaller than the implementation model: a partner chooses one "Diligence language" on the deal, and every generated stage inherits it. Historical and finalized drafts must remain auditable.

## Goals / Non-Goals

**Goals:**

- Provide one compact `English` / `简体中文` control for the whole diligence workflow.
- Default new interactive deals from the validated UI locale, with a safe English fallback for service and import paths.
- Make every asynchronous stage and retry use a persisted per-draft language snapshot.
- Localize generated narrative without changing machine contracts or evidence provenance.
- Preserve earlier language versions and finalized memos when a partner switches language.

**Non-Goals:**

- Translating source files, source quotations, user-authored answers, identifiers, enum values, or JSON keys.
- Generating both languages in one model call.
- Changing the general UI locale or the interactive Analyst's per-message language behavior.
- Automatically translating historical outputs during migration.

## Decisions

### Persist a mutable deal preference and an immutable draft snapshot

Add constrained `output_language` columns (`en`, `zh-CN`) to both `diligence_deals` and `diligence_memo_drafts`, defaulting existing rows to `en`. The deal column is the preference for the next run; the draft column is the authoritative language for a particular run. Add nullable `source_draft_id` on drafts to record language-version lineage.

Jobs and stage functions resolve language from the target draft, never from cookies, headers, or an untrusted job payload. A stage that creates the first draft snapshots the deal preference in the same persistence operation.

Alternative considered: store only on the deal. Rejected because changing the deal while a job is queued would make retries and partially completed drafts switch languages.

### Use the UI locale only as a creation default

The create-deal client sends the validated active locale as `output_language`; the API validates it against the domain allowlist. Affinity imports, background creation, and older clients omit it and receive `en` from the database default. The compact deal-level selector remains available as the explicit override.

Alternative considered: always bind output to the current UI locale. Rejected because a Chinese UI may be used to prepare an English investment-committee memo, and UI switching must not rewrite business data.

### Add one high-priority language contract to shared prompt composition

`buildSystemPrompt` accepts `outputLanguage` and appends a non-negotiable output-language block shared by `ingest`, `research`, `qa`, `draft`, `score`, and `render`. The block requires natural-language generated values in the requested language while preserving schema keys, enum tokens, IDs, citations, proper nouns, and verbatim evidence in their original form. Stage functions load the snapshot before composing prompts.

Deterministic fallback text produced in application code must use the same domain formatter so a failed or partial model response does not reintroduce English-only narratives.

Alternative considered: add "respond in Chinese" only to the final memo prompt. Rejected because Research, Checklist, scores, and fallback attention items would remain English and contaminate downstream context.

### Treat language changes as version creation once output exists

The language update endpoint checks the current draft. If it has no generated artifacts and is still a draft, the deal preference and draft snapshot may be updated together. If any generated artifact exists, changing language creates a new latest draft with the requested snapshot and `source_draft_id` pointing to the prior draft, resets the deal workflow to `ingest`, and leaves the source draft untouched. The next run processes the same deal-level source documents into the new language version.

The endpoint returns whether it updated in place or created a version so the UI can present accurate confirmation. A no-op request is idempotent.

Alternative considered: translate the finalized memo in place. Rejected because it destroys audit history and allows translated prose to diverge from its recorded intermediate evidence.

### Keep the UI control compact and stage-independent

The deal header shows a single language chip/dropdown. No stage-specific language controls are added. Before output exists, selection saves immediately. After output exists, the confirmation action is phrased as "Generate Chinese version" / "Generate English version" and explains that the current version remains available.

The selector is keyboard accessible, responsive, and localized through the existing `Diligence` catalog. Operational UI copy remains controlled by `next-intl`; stored generated artifacts remain controlled by the draft snapshot.

## Risks / Trade-offs

- **A new language version reruns the pipeline and consumes model/search capacity** → require confirmation after output exists and state that a new version will be generated.
- **Mixed-language source material may tempt the model to mirror the source** → put the output-language contract in the shared high-priority prompt and test mixed-language fixtures.
- **Application-authored fallback strings can remain English** → centralize localized fallback construction and cover both languages in contract tests.
- **Existing rows have no historical language metadata** → backfill them as `en`, matching observed current behavior, without rewriting artifacts.
- **Concurrent language switches could create duplicate drafts** → perform the switch in a database RPC or use a transaction-safe service operation with idempotency checks against the latest draft.

## Migration Plan

1. Add constrained columns and lineage foreign key; backfill all existing deals and drafts to `en`.
2. Regenerate checked-in database types and deploy backward-compatible reads with English fallback.
3. Add prompt propagation and focused tests before exposing the selector.
4. Add the API and UI control, then run English, Chinese, mixed-source, retry, and version-preservation E2E paths.
5. Rollback UI/API exposure first if needed; the additive columns can remain safely. No rollback rewrites existing generated artifacts.

## Open Questions

None. The first release supports exactly `en` and `zh-CN`, one language per draft version.
