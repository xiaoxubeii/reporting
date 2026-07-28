# Verification — merge founder dossiers into Research

Verified on 2026-07-28 from `/home/ubuntu/workspace/reporting` on branch `main`.

## Passing evidence

- `npx openspec validate merge-founder-dossiers-into-research --strict`
  - Change is valid.
- `npx vitest run lib/memo-agent/stages/research-founder-dossiers.test.ts tests/diligence-research-team.test.ts --reporter=basic`
  - 2 test files passed; 7 tests passed.
- Changed-scope ESLint for the Diligence UI, sheet, Research pipeline, and focused tests.
  - Exit code 0.
- `npx tsc --noEmit --project .harnesskit/evidence/merge-founder-dossiers-into-research/tsconfig.verify.json --pretty false`
  - Exit code 0.
- Scoped `git diff --check` for implementation, locales, tests, OpenSpec, and evidence.
  - Exit code 0.
- `npm exec next build -- --no-lint`
  - Exit code 0; compilation, type validation, page-data collection, static generation, and route output completed.

## Authenticated browser verification

Command:

```sh
node --env-file=.env.local .harnesskit/evidence/merge-founder-dossiers-into-research/verify-browser.cjs
```

Result:

```json
{"ok":true,"locales":["en","zh-CN"],"addEditRemove":true,"preResearch":true,"mobile":{"scrollWidth":390,"innerWidth":390}}
```

The real tenant route verified:

- no top-level Founders tab;
- pre-Research state has no ineffective add action in English or Simplified Chinese;
- Founders & Core Team appears immediately after Competitive Landscape;
- add, edit, and remove persist through the existing Research draft endpoint;
- the editor is an accessible right-side sheet;
- localized English and Simplified Chinese UI;
- 390 px viewport has no horizontal overflow;
- original `research_output` is restored in `finally`.

Post-run database audit: `restored=true`, no browser-fixture sentinels remain, and the original `research_output` is `null`.

Visual evidence:

- `research-team-desktop-final.png`
- `research-team-mobile-zh-CN-final.png`
- `research-team-pre-research-en.png`
- `research-team-pre-research-zh-CN.png`
- `research-team-zh-CN-final.png`

The authenticated application shell still emits two known responses outside this feature scope: `/api/portal/me` returns 404 and `/api/accounting/vehicle-index` returns 403. The browser verifier explicitly whitelists only these two responses and fails on any other same-origin 4xx/5xx response or page error.

## Repository-wide baseline checks

- `npm test` is not fully green: 10 files failed and 311 passed (4 skipped); 51 tests failed and 2152 passed (8 skipped).
- Failures are outside this change in auth/fund host validation, platform landing/logo, expert invitation, middleware access gate, locale action, provider OAuth host, tenant host, and expert validation contract tests.
- `./.harnesskit/scripts/verify-targeted.sh` reaches repository-wide lint and fails on existing unrelated lint debt.
- `./.harnesskit/scripts/verify-fast.sh` is blocked by the unrelated legacy `feed-discovery` feature status value `complete`, which is outside the current feature and not accepted by the current HarnessKit schema.

These baseline failures are recorded separately; the changed feature scope, production build, and authenticated browser workflow all pass.
