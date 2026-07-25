# Progress

## Current Focus

- Active feature: `add-devctl-service-manager`, a unified local lifecycle CLI for Web, Croner, Miniflux, and SearXNG with external-only Supabase status.
- Current task: complete; implementation, hardening, review, and real CLI verification are recorded below.
- Port contract: reserve 5000-5009, then 5010-5019, 5020-5029, and so on; service offsets are Web +0, Cron +1, Miniflux +2, and SearXNG +3.
- Completed merge of `add-search-product`: fund-configured categories now resolve through the unified code-owned adapter execution path on `main`.
- Completed follow-up in `redesign-follow-sources-catalog`: Following now groups sources directly by the user's personal Miniflux categories, while trusted curated Follow reuses the shared category picker.
- Current task: complete; all in-scope implementation, review, and authenticated desktop/mobile verification is recorded below.
- Completed scoped implementation: `add-feed-category-popover` replaces the Follow sources topic field with an anchored Miniflux category menu while preserving the active localization work.
- Branch/worktree: `main` in `/home/ubuntu/workspace/reporting`, explicitly confirmed by the user.

## Last Session

- Completed the personal Miniflux Feeds product and V1 Curated Explore implementation in `codex/add-feeds-product`. The feature remains API-only from Reporting: Miniflux owns subscriptions, categories, entries, read state, and saved state.
- Integrated the current `main` localization work into the feature branch. Conflict resolution preserved localized navigation and settings, Miniflux approval recovery, accessible Sheet labels, and the restricted same-origin Supabase development proxy.
- Confirmed the V1 boundary: one global non-admin Miniflux collector, Reporting BFF, Today `Me / Explore`, read-only curated categories/articles, and personal Follow through the existing per-user Miniflux service.
- Created the separate OpenSpec proposal, design, capability specification, and task list. The final contract uses namespaced IDs plus server-side collector ownership checks and intentionally excludes AEAD and all V2 persistence/intelligence.
- Implemented persistent `en` / `zh-CN` switching with `next-intl`, an allowlisted HttpOnly cookie, static catalog loaders, localized shared chrome and authentication pages, localized metadata, and dynamic document language.
- Extended localization into authenticated content: `/import` now localizes its metadata, document upload, company metrics, investment data, fund cash flow, error/status, and result-summary UI as one complete reference namespace. Its Analyst surface also localizes conversation controls, generated attachment prompts, proposed journal entries, and pending actions. The user clarified that every user-visible page—not only Import—must be migrated. Static message imports replace dev-fragile JSON chunks.
- Added per-turn Analyst response-language control: the latest user message selects the reply language, while a validated `en` / `zh-CN` UI locale is used only for language-neutral input. Injected business context and conversation memory do not select the response language.
- Localized the complete Feeds surface for this slice: `/feeds`, its URL-backed Explore view, `/feeds/sources`, both readers, metadata, live-region/status/error copy, relative dates, source counts, unread counts, topic/source controls, and mobile navigation. Article/source/category data remains unchanged.
- Resolved review findings for compact-selector accessibility, demo-banner copy, immediate `<html lang>` synchronization, and localized mobile drawer close labels.
- Preserved unrelated dirty-worktree changes.

## Verification

- Devctl: 24/24 focused tests passed across port allocation, Compose health/publisher parsing, lifecycle rollback/idempotency, partial ownership retention, runtime ownership/locking, environment filtering, and the real shell status entrypoint. Changed-scope ESLint, repository TypeScript, Bash/Node syntax, Miniflux/SearXNG Compose config, strict OpenSpec, HarnessKit fast, and `git diff --check` passed. Code and security re-reviews found no remaining blocker/high after lifecycle, health, environment, state, path, and permission hardening. HarnessKit targeted was run and remains blocked at the existing repository-wide lint debt outside the devctl scope.
- Devctl real CLI: the full Web/Cron/Miniflux/SearXNG stack started healthy at 5000-5003, repeated start was idempotent, all four HTTP/readiness probes returned healthy responses, stop and repeated stop succeeded, and no 5000-5003 listener remained. With port 5007 occupied, Web selected 5010 and the complete persisted block became 5010-5019. The shared external Supabase endpoint and ambient `reporting-miniflux` containers remained running after devctl stop.
- Search merge verification: OpenSpec strict validation, HarnessKit fast, TypeScript, changed-scope ESLint, production build, Compose validation, and full Vitest passed; HarnessKit targeted/full were attempted and remain blocked only by pre-existing repository-wide ESLint debt.
- Post-merge full Vitest: 157 files/1268 tests passed, with 2 files/4 environment-gated integration tests skipped. The pre-merge Category-to-Adapter focused suite passed 20 files/92 tests.
- Authenticated admin browser acceptance passed before merge: changing the `internet` category label and mapping from `web` to `pubmed` immediately changed Search and returned live PubMed results; the original configuration and disposable user were restored.
- Reporting SearXNG was healthy on loopback using the digest-pinned image; live combined Web/PubMed and partial-result behavior were exercised.
- Post-merge security review removed SearXNG from `vpnserver-proxy_default`; the service now stays on `reporting-search_default` and reaches host-published Privoxy port 8118 through `host-gateway`. Compose and the five deployment contract tests pass; the live container was recreated with its existing secret and is healthy on the isolated network.
- Personal category grouping follow-up: 103/103 focused service, route, grouping, UI-contract, and localization tests passed. Changed-scope ESLint has 0 errors (one existing `<img>` warning), changed-scope TypeScript has 0 diagnostics, strict OpenSpec, HarnessKit fast, and `git diff --check` passed. Both code/accessibility and security re-reviews found no remaining in-scope issues after focus restoration, duplicate-alert removal, safe generated group IDs, and the same-origin/auth/rate-limit/validation route order were fixed. A disposable real Reporting/Miniflux account followed `All Blog Feed` from Explore into a newly created `QA Cardiology` category; Following rendered that direct non-empty category group, search retained the group, and 1440x900 plus 390x844 layouts passed. Evidence: `.harnesskit/evidence/redesign-follow-sources-catalog/following-grouped-desktop.png` and `following-grouped-mobile.png`. The disposable account, Miniflux user, subscription, credentials file, and QA script were removed. HarnessKit targeted/full was attempted but remains blocked at repository-wide pre-existing lint debt outside the changed scope.
- Curated source catalog: 81 focused service/API/access/UI/localization tests passed; strict OpenSpec, HarnessKit fast, changed-scope lint/type checks, and `git diff --check` passed. Authenticated desktop and 390px mobile English/Chinese Explore, category Sheet, keyword search, URL discovery, trusted Follow, reload/Following, and personal-connection-failure-independence flows passed. The latest style pass matches 14px category labels to the featured source content, retains no Explore source-count or search-helper copy, and has no horizontal overflow. Code, accessibility, and security reviews have no remaining in-scope findings. Evidence: `.harnesskit/evidence/redesign-follow-sources-catalog/`. HarnessKit targeted remains blocked at repository-wide lint by unrelated existing errors.

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
- Code reviewer and security reviewer: completed. Locale changes now clear localized transient errors/announcements, preventing stale-language UI after a client refresh. A credential-bearing Playwright console log was permanently removed and `/.playwright-mcp/` is ignored; no blocker/high findings remain.
- Temporary local-only viewer identity and its one membership were deleted and verified absent.
- Analyst language focused Vitest: 21/21 passed across `tests/analyst-tool-loop-route.test.ts` and `tests/ui-localization.test.ts`; both tool-loop and createChat paths plus malicious-locale fallback are covered.
- Analyst browser QA: in one Chinese-UI Deal conversation, a Chinese question received a Chinese reply and the following English question received an English reply; both `/api/analyst` requests returned 200 with no page errors. Evidence: `.harnesskit/evidence/add-zh-en-i18n/analyst-response-language.png`.
- Analyst language code and security reviews: no findings. `git diff --check`, strict OpenSpec validation, and HarnessKit fast passed. Current repository-wide TypeScript/HarnessKit targeted verification remains blocked by unrelated in-progress page-localization type/lint failures.
- Feeds localization focused verification: 50/50 tests passed across the Feeds localization/UI inventory/behavior and feed state/service suites, including locale-change transient-state coverage; targeted ESLint passed with 0 errors and 5 existing `no-img-element` warnings.
- Authenticated Feeds browser QA: English → Simplified Chinese → reload persistence → English passed on `/feeds`, `/feeds?view=explore`, and `/feeds/sources`; all Feeds API requests returned 200. Chinese metadata, `lang="zh-CN"`, localized relative dates, desktop controls, and a 390px mobile layout without horizontal overflow were verified. The disposable Reporting/Miniflux QA identities were removed. Evidence: `.harnesskit/evidence/add-zh-en-i18n/feeds-sources-zh-mobile.png`.
- Browser console retained unrelated existing Vercel Analytics CSP blocks and two app-shell `/api/accounting/vehicle-index` 403s; no Feeds request failed.
- Feed category popover verification: 60/60 focused tests passed; targeted ESLint reported 0 errors and one existing `no-img-element` warning; strict OpenSpec validation and `git diff --check` passed. Repository-wide TypeScript currently reports 64 unrelated errors and 0 errors in the changed feed scope.
- Authenticated feed-category browser QA passed new-category creation with forced failure/retry, existing empty-category and uncategorized follow, Escape dismissal without mutation, success-versus-initial-load focus semantics, and the supplied folder-picker visual reference. The 1280×800 English picker is 448×368 and remains below the trigger; 1280×600 low-space desktop and Chinese 390×640 mobile automatically flip without clipping or horizontal overflow. Evidence: `.harnesskit/evidence/add-feed-category-popover/`; all disposable Reporting/Miniflux identities were removed.
- Final UI/UX review found no remaining issue after restoring collision handling, exact 80px folder rows, internal scrolling for many categories, and a fixed visible New Folder footer.
- Follow-up style alignment replaced the fixed white/green 448px reference treatment with a compact 320px popover using Reporting semantic theme tokens, standard controls, 16px icons, and 44px category rows; 14/14 focused UI tests, changed-file ESLint (0 errors), strict OpenSpec validation, and reviewer checks passed.
- Current authenticated browser acceptance is pending: Playwright reached the real `localhost:3001` entrypoint but its isolated session redirected to sign-in and could not inherit the user's ambient browser session.
- Persistent Croner runtime is implemented and verified: 29 focused tests pass across the five-job manifest, authenticated invocation, overlap protection, real one-shot/resident entrypoints, health/readiness, malformed request recovery, production secret strength, and graceful shutdown. Deployment docs now state Netlify/Vercel are Web-only without a separate Cron process.
- Cron security review has no remaining changed-scope blocker after malformed-target handling, production secret-strength enforcement, and the transitive `protobufjs` security update.

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

1. Continue normal product work from `main`; treat external Search adapter availability and non-Latin source-query behavior as operational follow-up work rather than merge blockers.
2. Decide whether to upgrade Next.js to a version that fixes the Server Actions advisory in a separate change.
3. Re-run HarnessKit targeted/full after the repository lint and stale attachment-copy baselines are repaired.
4. Continue complete namespace migrations for every remaining authenticated, public/legal/explainer/setup/token, and LP portal page.
