# Progress

## Current Focus

- Active change: `add-search-product`
- Current task: implementation and verification complete; prepare `codex/add-search-product` for merge.
- Branch/worktree: `codex/add-search-product` in `/home/ubuntu/workspace/reporting.worktrees/add-search-product`, based on local `main` commit `90543f5` after Feeds merged.

## Last Session

- Implemented one bounded federated Search page over exactly three server-only provider boundaries: caller-scoped Miniflux Feeds, Reporting-owned SearXNG Web, and direct professional adapters.
- Added direct PubMed, ClinicalTrials.gov API v2, and openFDA 510(k) transports; fixture-tested TCTMD and MassDevice parsers remain visibly unavailable until an operator-approved live transport exists.
- Added deterministic exact URL/identifier merging, `Feed > Specialized > Web` primary-origin precedence, fixed source/final caps, partial results, privacy-safe instrumentation, safe public URLs, access checks, and an atomic fail-closed per-user rate limit.
- Added responsive localized Search UI, desktop source rail, mobile source drawer with Apply/Cancel semantics, per-source textual states, feed reader state synchronization, focus return, external-link isolation, and Search-specific remote-image suppression.
- Removed all temporary Reporting/Miniflux test users and credential-bearing local scripts after browser verification.
- Completed the personal Miniflux Feeds product and V1 Curated Explore implementation in `codex/add-feeds-product`. The feature remains API-only from Reporting: Miniflux owns subscriptions, categories, entries, read state, and saved state.
- Integrated the current `main` localization work into the feature branch. Conflict resolution preserved localized navigation and settings, Miniflux approval recovery, accessible Sheet labels, and the restricted same-origin Supabase development proxy.
- Confirmed the V1 boundary: one global non-admin Miniflux collector, Reporting BFF, Today `Me / Explore`, read-only curated categories/articles, and personal Follow through the existing per-user Miniflux service.
- Created the separate OpenSpec proposal, design, capability specification, and task list. The final contract uses namespaced IDs plus server-side collector ownership checks and intentionally excludes AEAD and all V2 persistence/intelligence.
- Implemented persistent `en` / `zh-CN` switching with `next-intl`, an allowlisted HttpOnly cookie, static catalog loaders, localized shared chrome and authentication pages, localized metadata, and dynamic document language.
- Extended localization into authenticated content: `/import` now localizes its metadata, document upload, company metrics, investment data, fund cash flow, error/status, and result-summary UI as one complete reference namespace. Its Analyst surface also localizes conversation controls, generated attachment prompts, proposed journal entries, and pending actions. The user clarified that every user-visible page—not only Import—must be migrated. Static message imports replace dev-fragile JSON chunks.
- Resolved review findings for compact-selector accessibility, demo-banner copy, immediate `<html lang>` synchronization, and localized mobile drawer close labels.
- Preserved unrelated dirty-worktree changes.

## Verification

- Search OpenSpec strict validation and HarnessKit fast passed; every Search task is complete.
- Full Vitest: 148 files and 1169 tests passed, with 2 files/4 environment-gated integration tests skipped.
- `npx tsc --noEmit`, changed-file ESLint, Compose `config --quiet`, and `npx next build --no-lint` passed.
- Live database verification rejected NULL rate-limit arguments and allowed exactly 10 of 20 concurrent requests for one bucket.
- Reporting SearXNG was healthy on loopback using the digest-pinned image; live combined Web/PubMed and partial-result behavior were exercised.
- Authenticated desktop/mobile browser QA passed source selection, mobile draft cancellation/focus restoration, Feed-only Miniflux search, reader rendering, isolated HTTPS external links, Escape close, and return focus. Evidence: `.harnesskit/evidence/add-search-product/`.
- Code, database, and security reviews completed. All blocking/medium findings were fixed; test fixture counts were verified at zero.
- HarnessKit targeted/full were run but stop at the latest main branch's repository-wide pre-existing ESLint errors; no Search change has an ESLint error, and the production build passes when lint is isolated.
- After integrating main: 77 focused navigation, localization, CSP/proxy, Feeds UI, member provisioning, and Supabase URL/cookie tests passed; `npx tsc --noEmit` passed; both Feeds OpenSpec changes passed strict validation; `npx next build --no-lint` passed. The normal build remains blocked only by the repository-wide pre-existing ESLint debt recorded below.
- Feeds/Explore focused tests, strict OpenSpec validation, typecheck, production build, code/security review, and real desktop/mobile browser acceptance passed before merging the current main branch.
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

- Public search engines and professional APIs may rate-limit or return partial results; the UI exposes this per source and preserves successful results.
- TCTMD and MassDevice live transports remain disabled until operator approval and a reviewed implementation; fund policy alone cannot make them appear available.
- `next@14.2.35` is affected by a project-wide high-severity Server Actions DoS advisory. The locale feature now uses a bounded same-origin API endpoint and no longer adds a Server Action; framework remediation remains a separate maintenance change.
- Existing English authentication flows can display raw upstream error strings; React escapes them, but controlled error mapping would reduce content-spoofing and information-disclosure risk.
- Repository-wide lint/build and one unrelated full-suite assertion remain red for pre-existing reasons recorded above.
- `npm audit` retains the existing project baseline of 27 advisories (18 high, 2 critical). Search's added Testing Library/jsdom development dependencies add no new high/critical finding; framework/tooling upgrades remain a separate maintenance change.

## Next Session

1. Review and merge `codex/add-search-product` into `main`.
2. Enable Search only for a pilot fund after its SearXNG and approved direct sources pass health checks.
3. Repair repository-wide ESLint debt in a separate maintenance change, then rerun unmodified HarnessKit targeted/full.
