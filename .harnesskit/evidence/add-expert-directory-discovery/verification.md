# Expert Directory Discovery verification

## Outcome

Completed in `codex/add-expert-directory-discovery`.

The authenticated product flow now separates platform-certified experts, fund-confirmed experts, and fund-private discovery candidates. Fund admins can create, discover, confirm, reject, deactivate, reactivate, and select eligible experts in Diligence. Normal fund members see the two expert pools read-only and cannot access candidate management.

## Automated verification

- `npm test`: 186 files passed, 1426 tests passed; 3 files and 5 tests skipped by existing environment gates.
- `npx tsc --noEmit`: passed.
- Changed-file ESLint: passed for 32 JavaScript/TypeScript files.
- `./scripts/test-expert-validation-db.sh`: migration, RLS/RPC, idempotency, eligibility, and concurrency tests passed.
- `npx openspec validate add-expert-directory-discovery --strict`: passed.
- `git diff --check`: passed.
- `npx next build --no-lint`: passed.
- Static secret scan: 52 changed/untracked files inspected; no private key, provider token, JWT, or hard-coded secret findings.

Repository-wide `npm run lint`, regular `npm run build`, and HarnessKit targeted/full remain blocked by pre-existing ESLint failures outside the changed files. The lockfile was not changed; `npm audit --omit=dev` cannot evaluate the current invalid package tree.

## Browser verification

An authenticated fund-admin flow was run against the real local application and database:

1. Verified the three admin directory tabs.
2. Created a manual fund expert, deactivated it, and reactivated it.
3. Queried live PubMed and ClinicalTrials.gov discovery adapters.
4. Confirmed a source-backed candidate with an explicit email address.
5. Verified the Fund confirmed / Discovery trust badge.
6. Selected the confirmed expert in an existing Diligence expert-validation request.
7. Repeated the directory view at a 390px mobile viewport; horizontal overflow was 0 pixels.

The browser run recorded known unrelated console noise from existing Content Security Policy integrations and repeated 403 responses from `/api/accounting/vehicle-index`. Expert-directory and Diligence requests completed successfully. All QA-only database rows were removed after evidence capture.

## Evidence files

- `01-platform-certified-desktop.png`
- `02-fund-expert-lifecycle.png`
- `03-discovery-confirmed.png`
- `04-diligence-selected.png`
- `05-mobile-fund-experts.png`
- `browser-result.json`
