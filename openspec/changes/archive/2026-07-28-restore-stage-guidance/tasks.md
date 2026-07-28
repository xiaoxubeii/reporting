## 1. Prompt and Data Contract

- [x] 1.1 Add regression tests proving system prompts inject only the matching fund-level stage guidance
- [x] 1.2 Remove project-level analysis-preference types, normalization, API handling, and prompt composition
- [x] 1.3 Add a forward migration that drops `diligence_deals.analysis_preferences` without data translation

## 2. Diligence Interface

- [x] 2.1 Remove the project-header analysis-preferences trigger and sheet with its localization strings
- [x] 2.2 Restore or confirm inline `StageGuidance` for each applicable agent-workflow/schema stage with clear fund-wide scope
- [x] 2.3 Add UI contract tests proving the project-wide control is absent and stage guidance remains available

## 3. Verification

- [x] 3.1 Run focused unit and contract tests, TypeScript checks, lint, and `git diff --check`
- [x] 3.2 Run HarnessKit fast and targeted verification and resolve in-scope failures
- [x] 3.3 Start the isolated worktree application and exercise the real diligence stage-guidance flow in a browser
- [x] 3.4 Review the final diff against the OpenSpec acceptance scenarios and record any remaining risks
