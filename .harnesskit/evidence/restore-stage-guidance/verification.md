# Restore stage guidance verification

## Result

Passed the scoped implementation and real-browser acceptance checks for
`restore-stage-guidance`.

## Automated checks

- `vitest`: 15/15 focused prompt-boundary and UI-contract tests passed.
- `openspec validate restore-stage-guidance --strict`: passed.
- `git diff --check`: passed.
- HarnessKit `verify-fast.sh`: passed after temporarily supplying the three
  HarnessKit files that are present only in the source worktree.
- Changed-file ESLint comparison: the branch introduces zero diagnostics versus
  `main` and removes one existing `no-explicit-any` diagnostic.

The repository-wide TypeScript and build checks remain blocked by existing
baseline failures also reproduced on `main`:

- `tests/platform-landing-logo-assets.test.ts:39` fails TS2802 under the current
  TypeScript target.
- The production build stops on the repository's existing global ESLint debt.

## Browser checks

The isolated worktree ran on port 3020 against the existing CCI test tenant.
The browser script authenticated as `test@example.com`, then verified:

1. The project header contains no `分析偏好` control.
2. The Checklist/ingest workflow exposes fund-wide stage guidance.
3. A temporary ingest value saves and reopens on the ingest stage.
4. The Research stage does not receive the ingest value.
5. Research guidance remains unchanged while ingest guidance is edited.
6. The original ingest value is restored after the test.

The only observed non-2xx shell responses were the established test-account
baselines for `/api/portal/me`, `/api/accounting/vehicle-index`, and
`/api/time-zone`; no stage-guidance runtime errors occurred.

Artifacts:

- `browser-result.json`
- `checklist-stage-guidance.png`
- `research-stage-guidance.png`
- `verify-browser.cjs`

## Remaining risk

The forward migration intentionally discards stored project-level analysis
preferences. This is the requested no-compatibility restoration and cannot
recover those values after deployment.
