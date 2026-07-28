## Context

`buildSystemPrompt` historically selected one fund-level `memo_agent_prompts` row using the active stage. Commit `ddea118d` added a second, deal-level `analysis_preferences` JSON document and appended it to every stage. The new document contains focus areas, depth, and one universal custom-instruction string, so it bypasses the existing stage boundary and duplicates the partner-guidance concept.

The analysis-preferences column and UI are already present in `main`, so restoration must be delivered as a forward code and schema change rather than by rewriting history.

## Goals / Non-Goals

**Goals:**

- Make `(fund_id, stage)` in `memo_agent_prompts` the only partner-editable system-prompt guidance source.
- Show guidance in the workflow/schema surface for the stage being configured.
- Remove project-wide analysis-preference persistence, API handling, prompt composition, and header UI.
- Prove that a stage receives only its matching guidance.

**Non-Goals:**

- Add project-specific prompt overrides.
- Migrate project-wide custom instructions into stage rows.
- Change hard rules, output language, schemas, voice synthesis, providers, or stage orchestration.
- Redesign the broader diligence navigation or memo-generation settings.

## Decisions

1. **Remove the complete project-level preference document.** Focus areas and depth were introduced with the universal custom instruction and are not part of the original stage-guidance contract. Retaining them would create a hybrid behavior instead of restoring the original implementation.

2. **Keep `memo_agent_prompts` unchanged.** The table already enforces one row per fund and stage and the prompt builder already queries the exact active stage. Reusing it avoids a second schema and preserves the settings and inline `StageGuidance` clients.

3. **Use a forward destructive migration.** Add a new migration that drops `diligence_deals.analysis_preferences`. Do not edit the migration already recorded in deployed databases and do not translate its contents.

4. **Remove the project-header control.** Guidance remains available inline through `StageGuidance` in the stage's agent-workflow/schema section and centrally through the existing diligence-prompts API. Reanalysis remains an explicit stage action rather than an effect of saving guidance.

5. **Test stage isolation at the prompt boundary.** Regression tests shall seed guidance for multiple stages, construct prompts for a selected stage, and assert that only the selected guidance is present. UI/API contract tests shall assert that project-level analysis preferences are absent.

## Risks / Trade-offs

- **[Risk] Dropping the column discards user-entered project preferences.** → This is intentional per the requested no-compatibility restoration; document the destructive migration clearly.
- **[Risk] Fund-level guidance changes affect every deal in the fund.** → Preserve and clearly label the existing fund-wide scope in the UI.
- **[Risk] A removed client could still PATCH `analysis_preferences`.** → Remove the accepted PATCH field and cover rejection/no-op behavior with a route contract test.
- **[Risk] An inline stage surface may have been removed during adjacent UI work.** → Verify every actual stage mapping and restore only the existing `StageGuidance` path without redesigning unrelated panels.

## Migration Plan

1. Deploy application code that no longer reads or writes `analysis_preferences` and removes its UI.
2. Apply a new migration that drops `diligence_deals.analysis_preferences`.
3. Verify prompts for ingest, research, QA, draft, score, and render continue to select only `memo_agent_prompts.stage`.
4. Rollback, if required, by re-adding the JSONB column with an empty default; discarded values are not recoverable by design.

## Open Questions

None. Project-specific stage overrides are explicitly deferred to a separate change.
