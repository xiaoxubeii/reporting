# Progress

## Current Focus

- Active change: `add-zh-en-i18n`
- Current task: inventory and localize every user-visible page; Import is the reference implementation only.
- Branch/worktree: `main` in `/home/ubuntu/workspace/reporting`, explicitly confirmed by the user.

## Last Session

- Confirmed the V1 boundary: one global non-admin Miniflux collector, Reporting BFF, Today `Me / Explore`, read-only curated categories/articles, and personal Follow through the existing per-user Miniflux service.
- Created the separate OpenSpec proposal, design, capability specification, and task list. The final contract uses namespaced IDs plus server-side collector ownership checks and intentionally excludes AEAD and all V2 persistence/intelligence.
- Implemented persistent `en` / `zh-CN` switching with `next-intl`, an allowlisted HttpOnly cookie, static catalog loaders, localized shared chrome and authentication pages, localized metadata, and dynamic document language.
- Extended localization into authenticated content: `/import` now localizes its metadata, document upload, company metrics, investment data, fund cash flow, error/status, and result-summary UI as one complete reference namespace. Its Analyst surface also localizes conversation controls, generated attachment prompts, proposed journal entries, and pending actions. The user clarified that every user-visible page—not only Import—must be migrated. Static message imports replace dev-fragile JSON chunks.
- Resolved review findings for compact-selector accessibility, demo-banner copy, immediate `<html lang>` synchronization, and localized mobile drawer close labels.
- Preserved unrelated dirty-worktree changes.

## Verification

- Focused Vitest: 74 passed across six related files after adding development loopback and internal bind-host port-forward coverage.
- Expanded focused Vitest: 76 passed across the same six locale/access files, including the complete Import and embedded Analyst namespace contracts.
- `npx tsc --noEmit`: passed.
- Targeted ESLint for i18n-touched files: 0 errors; one pre-existing `<img>` warning in `components/app-header.tsx`.
- `openspec validate add-zh-en-i18n --strict`: passed.
- HarnessKit fast: passed.
- HarnessKit targeted/full: run, but stopped at repository-wide pre-existing lint errors.
- Full Vitest: 712 passed, 1 unrelated stale assertion failed in `tests/analyst-accounting-gate.test.ts` after existing Excel copy was added.
- Production build: application compilation succeeded, then repository-wide pre-existing ESLint errors stopped the build.
- `npx next build --no-lint`: passed, confirming production compilation, type validation, page-data collection, and route generation after isolating the existing global lint blocker.
- Authenticated Import browser QA: `lang="zh-CN"`, localized metadata, all four workflow sections/actions/placeholders, and reload persistence passed; the temporary test user and membership were removed.
- Browser QA: desktop/mobile public, auth, and authenticated app-shell flows passed. Authenticated switching preserved the viewer session and exact dynamic pathname/query/hash; cross-page persistence, keyboard selection, and drawer close-focus restoration passed. Evidence: `.harnesskit/evidence/add-zh-en-i18n/`.
- Browser console: after adding localized drawer title/description, a clean mobile drawer pass had no page errors. No captured application 4xx/5xx requests.
- Code reviewer and security reviewer: completed. In-scope review findings were fixed.
- Temporary local-only viewer identity and its one membership were deleted and verified absent.

## Decisions

- Feature plan is the source of truth for execution shape.
- OpenSpec is the source of truth for change intent and task scope when required.
- `.harnesskit/state/feature_list.json` is the machine-readable execution state.
- `.harnesskit/state/progress.md` is the cross-session handoff.

## Open Risks

- `next@14.2.35` is affected by a project-wide high-severity Server Actions DoS advisory. The locale feature now uses a bounded same-origin API endpoint and no longer adds a Server Action; framework remediation remains a separate maintenance change.
- Existing English authentication flows can display raw upstream error strings; React escapes them, but controlled error mapping would reduce content-spoofing and information-disclosure risk.
- Repository-wide lint/build and one unrelated full-suite assertion remain red for pre-existing reasons recorded above.

## Next Session

1. Decide whether to upgrade Next.js to a version that fixes the Server Actions advisory in a separate change.
2. Re-run HarnessKit targeted/full after the repository lint and stale attachment-copy baselines are repaired.
3. Continue complete namespace migrations for every remaining authenticated, public/legal/explainer/setup/token, and LP portal page.
