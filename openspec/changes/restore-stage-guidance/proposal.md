## Why

The diligence project header currently exposes project-wide analysis preferences that are appended to every memo-agent stage, which conflicts with the established stage-specific guidance model and makes the scope of partner instructions ambiguous. Restore the original single source of truth so each agent run receives only the fund guidance configured for its current stage.

## What Changes

- **BREAKING** Remove project-level `analysis_preferences`, including focus areas, depth, and universal custom instructions, from diligence deals.
- Remove the project-header analysis-preferences sheet and its save/reanalyze flow.
- Restore `memo_agent_prompts`, keyed by `(fund_id, stage)`, as the only partner-editable guidance injected into memo-agent system prompts.
- Keep stage guidance editable inline with the corresponding agent-workflow/schema area and through the existing fund settings API.
- Add a forward database migration that removes the already-applied `analysis_preferences` column without translating its data.

## Capabilities

### New Capabilities

- `stage-specific-memo-guidance`: Defines the fund-level, stage-specific guidance contract, its UI scope, and its prompt-injection behavior.

### Modified Capabilities

None.

## Impact

- Diligence project header and agent-workflow UI.
- Diligence deal PATCH contract and database schema.
- Memo-agent system prompt construction for ingest, research, QA, draft, score, and render stages.
- Localization and focused regression tests for guidance scope and removed analysis-preference controls.
