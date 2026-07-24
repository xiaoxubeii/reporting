# Feature Planning Flow

Use this file when Feature Planning Gate is selected before feature-like
implementation. The main agent owns this plan, assigns work, and merges feature
branches back to the base branch one by one.

## Trigger

Run this gate for feature-like, multi-part, risky, or contract-changing work.
Simple localized bug fixes may use Bugfix Lane instead. Single-feature work is
the lightweight planning case. Multi-feature work may become parallel work after
dependency and ownership checks.

## Feature Inventory

| Feature ID | Goal | Lane | OpenSpec | Acceptance | Parallel Class | Dependencies | Owner | Worktree | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expert-validation | Close the Research gap/contradiction → expert answer → industry_expert → existing evidence pipeline loop | feature-planning | `openspec/changes/add-expert-validation` | Real internal and public browser flow works; one immutable submitted answer is materialized and enqueued with the documented security boundaries | single-feature | existing Diligence, email, AI, storage, job pipeline | main-agent | current checkout | in_progress |
| custom-ai-provider | Configure one generic OpenAI-compatible provider such as MiniMax or codex-lb | feature-planning | `openspec/changes/add-custom-ai-provider` | Admin can save key/base URL/model, select the complete provider as default, and existing AI factory uses it | main-agent-only | existing settings encryption, URL validation, OpenAI provider factory | main-agent | current checkout | complete |
| ui-localization | Add persistent English/Simplified Chinese UI switching without changing application URLs | feature-planning | `openspec/changes/add-zh-en-i18n` | Every user-visible page and shared chrome switch languages on the same URL, persist on reload, render the correct document language, and preserve business/access semantics | serial-required | all App Router visual pages and page-level components, shared navigation/authentication, current pathname-based middleware | main-agent | current checkout | in_progress |
| feed-category-popover | Select or create a Miniflux category from an anchored menu when following a personal source | feature-planning | `openspec/changes/add-feed-category-popover` | Follow opens a responsive accessible theme-aware folder picker for Uncategorized, existing categories, or inline new category creation; success refreshes the catalog and failure remains recoverable in context | serial-required | feeds-product, current Feeds localization slice, existing subscription mutation | main-agent | current checkout | in_progress |
| feeds-product | Add personal Today and Follow sources backed exclusively by Miniflux APIs | feature-planning | `openspec/changes/add-feeds-product` | Approved users receive isolated Miniflux identities and can read, save, discover, categorize, follow, and unfollow through the authenticated Reporting BFF | serial-required | Miniflux V2, Reporting auth and approval workflow, Dealflow grants | main-agent | `/home/ubuntu/workspace/reporting.worktrees/add-feeds-product` | complete |
| curated-explore | Add a global read-only curated discovery view backed by one non-admin Miniflux user | feature-planning | `openspec/changes/add-curated-explore` | Authorized users can browse curated categories/articles and idempotently follow a trusted source into their personal Miniflux without shared read/save mutations or Reporting feed tables | serial-required | feeds-product, Miniflux BFF, personal FeedService, Today reader | main-agent | `/home/ubuntu/workspace/reporting.worktrees/add-feeds-product` | complete |
| croner-node-runtime | Replace Vercel Cron with one persistent Croner process while running the existing Next.js API routes on a persistent Node server | feature-planning | `openspec/changes/replace-vercel-cron-with-croner` | Production exposes separate Web and Cron start commands; the Cron process schedules the existing five authenticated routes with overlap protection, health reporting, bounded requests, and graceful shutdown; Vercel schedules are removed | main-agent-only | existing Next.js cron routes, `CRON_SECRET`, production process supervisor | main-agent | current checkout | complete |

## Feature Requirement Contract

Copy this block for each planned feature. Keep it short; it is the shared
contract for self-check, review, testing, and merge.

### Feature: expert-validation

#### OpenSpec Decision

- Required: yes
- Reason: HarnessKit requires project-owned OpenSpec for feature-like work.
- Change: `openspec/changes/add-expert-validation`
- Task: implement `tasks.md` serially from persistence/contracts through UI and E2E

#### Acceptance

- An authorized Diligence writer can create a request from a Research gap or contradiction, confirm sanitized generation output, manually choose or Top-5 match one expert, and issue one invitation.
- The public fragment-token page is no-store and analytics-free, exposes only the confirmed question/context, and accepts one immutable bounded response without an account or session.
- Submission automatically and idempotently creates one private `industry_expert` document and uses the existing explicit-document Ingest path; no Review/Accept/Reject, Attention, Q&A, Research version, or freshness branch is created.
- Prompt-like expert content remains untrusted evidence and cannot close the Ingest document boundary.

#### Allowed Change Scope

- `supabase/migrations/**`
- `lib/expert-validation/**`, focused existing email/rate-limit/Ingest prompt integrations
- `app/api/diligence/[id]/expert-validations/**`, `app/api/public/expert-response/**`
- `app/(app)/diligence/[id]/**`, `app/expert-response/**`
- focused tests and generated database types

#### Shared Contract Changes

- New `experts` and `diligence_expert_requests` tables/RLS/RPCs.
- New internal expert directory/request routes and public token-scoped resolve/submit routes.
- Request states are exactly `draft`, `invited`, `submitted`; submission triggers evidence materialization.
- One fixed embedding provider/model/dimension configured by server environment for V1.

#### Verification Plan

- smoke: OpenSpec strict validation, HarnessKit fast, TypeScript compile.
- targeted: expert validation unit/API tests, migration/RLS contract checks, existing Research prompt regression tests.
- contract: token state/concurrency, redacted DTO, one-document materialization, prompt-injection boundary.
- full: production build, HarnessKit full, and real authenticated internal + public browser workflow.

#### Review Required

- reviewer: yes
- security-reviewer: yes, bearer token, RLS, PII, prompt injection, external submission
- docs-researcher: no, project primitives and installed SDK contracts are authoritative
- browser/QA: yes, internal and public workflow is user-visible

#### Progress / Evidence

- status: in_progress
- branch/worktree: current checkout; unrelated dirty user changes preserved; no commit requested
- implementation: request resolver, static catalog loaders, HttpOnly locale preference, root provider/metadata/lang, shared public/portal/app chrome, and authentication entry points complete
- focused verification: 15 locale/action/navigation tests passed; TypeScript, targeted ESLint, OpenSpec strict, and HarnessKit fast passed
- browser: real Chrome verified English-to-Chinese URL/query/hash preservation, immediate and reload `lang`, same-origin new-tab persistence, public/auth desktop/mobile layouts, localized mobile close control, and dark mode; screenshots under `.harnesskit/evidence/add-zh-en-i18n/`
- reviews: code review complete and all in-scope findings fixed; security review found no i18n XSS/path/cookie/open-redirect issue
- verification gaps: no disposable authenticated login or configured demo account; HarnessKit targeted/full and production build are blocked by existing repository lint failures; full Vitest has one unrelated stale attachment-copy assertion
- security remediation: locale preference moved from a Server Action to a bounded same-origin JSON endpoint; the existing project-wide Next.js advisory remains a separate maintenance risk
- branch: `main`
- worktree: current checkout; unrelated dirty user changes are preserved
- commit: none requested
- self-check: pending
- tests: pending
- risks: Supabase extension/provider availability, cross-storage materialization recovery, public token leakage, large existing Diligence component

### Feature: custom-ai-provider

#### OpenSpec Decision

- Required: yes
- Reason: This is a user-visible cross-boundary settings and provider-factory capability.
- Change: `openspec/changes/add-custom-ai-provider`
- Task: implement `tasks.md` serially through the existing OpenAI-compatible path

#### Acceptance

- An administrator can configure one API key, safe base URL, exact model, and optional bounded JSON request parameters for a custom OpenAI-compatible endpoint such as MiniMax or codex-lb.
- The provider is selectable as default only when all fields are complete.
- Existing Reporting features instantiate the current OpenAI-compatible client with that configuration and merge the parameters without provider-specific hard-coding.
- Existing OpenRouter data remains valid; no plugin registry, multiple custom slots, or model discovery is introduced.

#### Allowed Change Scope

- `app/(app)/settings/**`
- `app/api/settings/route.ts`
- `lib/ai/**`, focused provider configuration helpers in `lib/pipeline/processEmail.ts`
- `supabase/migrations/**`, `lib/types/database.ts`
- focused tests and OpenSpec/HarnessKit planning artifacts

#### Shared Contract Changes

- The user-facing `openrouter` configuration slot is presented as `Custom (OpenAI-compatible)`.
- A configured custom provider requires encrypted key presence, base URL, and model.
- Existing storage fields and provider identifier remain unchanged for backward compatibility.
- Optional parameters are stored in one additive JSONB compatibility field, validated as a bounded object, and cannot override system-controlled request fields.

#### Verification Plan

- smoke: OpenSpec strict validation and HarnessKit fast.
- targeted: provider/settings contract tests and TypeScript compile.
- full: authenticated Settings browser flow; live third-party inference is not required because no user credential was supplied.

#### Review Required

- reviewer: main-agent self-review; no delegation available for this scoped change
- security-reviewer: main-agent URL/secret-boundary review
- docs-researcher: no, this consumes the existing OpenAI-compatible contract
- browser/QA: yes

#### Progress / Evidence

- status: in_progress
- branch: `main`
- worktree: current checkout; unrelated dirty user changes are preserved
- commit: none requested
- tests: original provider verification passed; generic request-parameters verification pending
- verification gaps: HarnessKit targeted/global lint is blocked by pre-existing repository lint errors; full Vitest has one unrelated stale copy assertion in `tests/analyst-accounting-gate.test.ts`
- cleanup: temporary provider values restored to null/default Anthropic; temporary admin and browser profile removed
- risks: request parameters must remain bounded, must not contain plaintext credentials, and must not override Reporting-controlled model/message/token/stream/tool fields

### Feature: ui-localization

#### OpenSpec Decision

- Required: yes
- Reason: This is a user-visible, cross-cutting behavior change spanning request rendering, shared navigation, authentication, and browser persistence.
- Change: `openspec/changes/add-zh-en-i18n`
- Task: implement `tasks.md` serially from locale contracts through real browser verification

#### Acceptance

- Every localized request resolves to exactly `en` or `zh-CN` from a validated browser preference with English fallback.
- A user can switch language on the current pathname/query, remain signed in, and retain the selection across reloads and new pages in the same browser.
- Shared authenticated navigation/theme controls, public and portal chrome, and authentication entry points render complete English or Simplified Chinese copy with the correct HTML `lang`.
- Every user-visible authenticated, public/legal/explainer/setup/token, and LP portal page migrates as a complete namespace; Import remains the reference implementation rather than the delivery boundary.
- Routes, access keys, database/user content, configured currency, generated documents, email, and AI output are not changed by UI locale selection.

#### Allowed Change Scope

- `i18n/**`, `messages/**`, `next.config.mjs`, package manifests, locale TypeScript augmentation
- `app/layout.tsx`, focused authentication layouts/pages, locale preference API, and its access-registry entry
- `components/language-switcher.tsx`, `components/app-sidebar.tsx`, `components/app-shell.tsx`, `components/portal-chrome.tsx`, focused public chrome
- all user-visible `app/**/page.tsx` routes, their metadata/layouts, and page-level rendering components as complete page-namespace migrations
- focused locale/catalog/navigation tests and OpenSpec/HarnessKit planning artifacts

#### Shared Contract Changes

- Supported locales are exactly `en` and `zh-CN`; default locale is `en`.
- The `NEXT_LOCALE` cookie stores the validated per-browser preference; no database schema changes.
- Existing URLs, middleware pathname/access contracts, feature keys, and business currency remain unchanged.
- English and Simplified Chinese catalogs expose the same semantic message keys.

#### Verification Plan

- smoke: OpenSpec strict validation, HarnessKit fast, catalog JSON/key parity.
- targeted: locale resolution/action/catalog/navigation tests and TypeScript compile.
- full: production build, HarnessKit full, and real authenticated, public/legal, setup/token, and LP portal desktop/mobile browser switching flows.

#### Review Required

- reviewer: yes, shared rendering and navigation correctness
- security-reviewer: yes, untrusted cookie validation and safe loader/API boundaries
- docs-researcher: no, verified official `next-intl` and Next.js contracts are already captured
- browser/QA: yes, language switching is user-visible and cross-boundary

#### Progress / Evidence

- status: in_progress
- branch: `main`
- worktree: current checkout; unrelated dirty user changes are preserved
- commit: none requested
- self-check: Feeds page slice matches the complete-namespace acceptance boundary; routes, access, Miniflux ownership, article/source content, and identifiers remain unchanged
- tests: 50 focused Feeds localization/inventory/behavior/state/service tests passed, including locale-change transient-state coverage; targeted ESLint has 0 errors and 5 existing image warnings
- browser: authenticated English → Chinese → reload → English passed for `/feeds`, Explore, and Follow sources on desktop/mobile; all Feeds API requests were 200; disposable Reporting/Miniflux identities were removed
- reviews: localized transient errors/announcements are cleared on locale changes; the credential-bearing Playwright log was permanently removed and `/.playwright-mcp/` is ignored; no blocker/high findings remain
- verification gaps: repository-wide TypeScript/HarnessKit targeted verification remains blocked by unrelated in-progress page-localization type failures; full product-surface tasks remain in progress
- risks: dynamic root rendering, mixed-language omissions, CJK wrapping/font fallback, shared-file overlap with existing user work

### Feature: feed-category-popover

#### OpenSpec Decision

- Required: yes
- Reason: This is a user-visible interaction change with an additive source-catalog contract.
- Change: `openspec/changes/add-feed-category-popover`
- Task: implement `tasks.md` test-first through service projection, localized UI, review, and browser verification

#### Acceptance

- Activating an unfollowed source's Follow button opens an anchored menu rather than relying on a permanent page-level category field.
- Uncategorized and existing category choices follow immediately; New category expands an inline bounded input and explicit confirmation.
- Pending state prevents duplicates; failure remains visible and retryable in the open menu; Escape and outside interaction dismiss without mutation.
- Empty Miniflux categories remain selectable while only non-empty categories appear as source-browsing topic cards.
- The menu remains accessible and inside desktop/mobile viewports in English and Simplified Chinese.

#### Allowed Change Scope

- `components/feeds/follow-sources.tsx`, `components/feeds/api.ts`
- `lib/feeds/service.ts` and focused service/UI tests
- `messages/en.json`, `messages/zh-CN.json`
- focused OpenSpec and HarnessKit planning/evidence artifacts

#### Shared Contract Changes

- `/api/feeds/sources` adds a `categories` collection projected from the already-fetched Miniflux categories.
- Existing `sources`, non-empty `topics`, and POST `/api/feeds/subscriptions` semantics remain compatible.
- Category names remain bounded by the server and Miniflux remains the sole category owner.

#### Verification Plan

- smoke: strict OpenSpec validation, diff check, catalog parity.
- targeted: feed service and UI/localization contract tests, targeted ESLint and TypeScript.
- full: authenticated desktop/mobile browser flow for Uncategorized, existing category, new category, failure recovery, and dismissal.

#### Review Required

- reviewer: yes, category-to-source association and state correctness
- security-reviewer: no new credential, authorization, persistence, or external-input boundary
- browser/QA: yes, the interaction is user-visible and responsive

#### Progress / Evidence

- status: in_progress
- branch: `main`
- worktree: current checkout; unrelated localization and branding changes are preserved
- commit: requested; pending final verification
- tests: 14 focused compact/theme-aware UI regression tests passed; changed-file ESLint has 0 errors and one existing image warning; strict OpenSpec and diff checks passed
- browser: earlier functional English desktop and Simplified Chinese 390px category flows passed; authenticated visual acceptance for the follow-up compact semantic-token styling remains pending because the isolated automation session could not inherit the ambient browser login
- reviews: compact styling code review found no correctness or accessibility issue; a native-disabled regression for already-followed discovery rows was fixed before commit
- verification gaps: repository-wide TypeScript currently has 64 unrelated existing errors from the concurrently changing repository state, with 0 errors in the changed feed scope; HarnessKit fast has no configured automated QA target, so the required browser acceptance ran directly
- risks: shared-file overlap with the still-active localization change; existing app-shell accounting 403 and Vercel Analytics CSP console noise remain outside this feature

### Feature: feeds-product

#### OpenSpec Decision

- Required: yes
- Change: `openspec/changes/add-feeds-product`
- Task: completed from Miniflux configuration and per-user provisioning through BFF routes, Today, Follow sources, tests, reviews, and browser acceptance

#### Acceptance

- Admin approval automatically provisions one isolated non-admin Miniflux identity per Reporting user and supports safe retry after partial failure.
- Reporting reads and mutates feed data only through authenticated Miniflux APIs; it does not mirror subscriptions, categories, entries, read state, or saved state into Reporting tables.
- Today and Follow sources support the V1 reader/discovery workflow with independent `feeds` feature gating inside the Dealflow grant domain.

#### Progress / Evidence

- status: complete
- branch/worktree: `codex/add-feeds-product` in `/home/ubuntu/workspace/reporting.worktrees/add-feeds-product`
- OpenSpec: strict validation passed; every task in `openspec/changes/add-feeds-product/tasks.md` is complete
- verification: focused tests, TypeScript, no-lint production build, code/security review, and real desktop/mobile browser acceptance passed
- merge integration: current main localization and accessibility behavior retained; mixed `deals=admin` / `feeds=everyone` member access is regression-tested

### Feature: curated-explore

#### OpenSpec Decision

- Required: yes
- Reason: this is a browser-visible cross-boundary feature with a new shared Miniflux identity and security contract.
- Change: `openspec/changes/add-curated-explore`
- Task: implement `tasks.md` contract-first from configuration/references through service, routes, UI, review, and real browser verification

#### Acceptance

- One server-only, non-admin Miniflux collector provides the same curated categories and latest articles to every authorized Reporting user.
- Explore omits and never mutates collector read/saved state; personal Today remains authoritative and independent.
- Follow accepts only a namespaced collector source reference, revalidates collector ownership, resolves the trusted feed URL server-side, and writes idempotently through the current user's personal Miniflux.
- Today exposes URL-backed `Me / Explore` sibling views on desktop and mobile without adding Reporting feed persistence, AEAD, trending, clustering, or AI summaries.

#### Allowed Change Scope

- `openspec/changes/add-curated-explore/**` and the existing Feeds architecture discussion
- `lib/feeds/**`, focused Miniflux client/config/access contracts
- `app/api/feeds/explore/**`, `app/(app)/feeds/**`, `components/feeds/**`
- `.env.example`, focused tests, and browser evidence
- HarnessKit plan/state/progress evidence only

#### Shared Contract Changes

- Adds one server-only `MINIFLUX_EXPLORE_TOKEN_FILE` / `MINIFLUX_EXPLORE_TOKEN` secret while reusing `MINIFLUX_BASE_URL`.
- Adds typed `explore-category:*`, `explore-source:*`, and `explore-entry:*` references with server-side collector ownership verification.
- Adds four allowlisted `/api/feeds/explore/*` contracts; only Follow mutates state, and it mutates the caller's personal account.
- Adds an Explore-specific DTO that contains no shared `isRead` or `isSaved` fields.

#### Verification Plan

- smoke: OpenSpec strict validation, reference/config tests, HarnessKit fast.
- targeted: collector service, Miniflux filter, BFF route/access, personal Follow isolation/idempotence, and UI contract tests.
- full: TypeScript, lint, full tests, production build, HarnessKit full, code/security review, and real authenticated desktop/mobile Miniflux flow.

#### Review Required

- reviewer: yes, API/DTO/UI separation and reuse correctness
- security-reviewer: yes, server-only token, non-admin identity, ownership checks, SSRF boundary, per-user writes, and mutation surface
- docs-researcher: no, installed Miniflux client behavior and current project contracts are authoritative
- browser/QA: yes, Today is user-visible and Follow crosses collector/personal accounts

#### Progress / Evidence

- status: complete
- branch: `codex/add-feeds-product`
- worktree: `/home/ubuntu/workspace/reporting.worktrees/add-feeds-product`; unrelated dirty user changes are preserved
- planning: separate `add-curated-explore` proposal, design, specification, and tasks created; latest contract intentionally excludes AEAD and V2 persistence/intelligence
- implementation: global non-admin collector, strict namespaced references, read-only DTO/routes, URL-backed Me/Explore UI, and idempotent personal Follow complete
- tests: focused Explore service, reference, API, access, state-isolation, and UI contract tests passed; strict OpenSpec validation passed
- reviews: code and security reviews complete with no remaining blocker/high findings
- browser: real authenticated desktop/mobile Me/Explore and Follow flows passed
- risks: collector token leakage, accidental collector state mutation, untrusted source refs, personal-account cross-write, and personal/collector failure coupling

### Feature: croner-node-runtime

#### OpenSpec Decision

- Required: yes
- Reason: This changes the production scheduler, process topology, authentication transport, and deployment contract.
- Change: `openspec/changes/replace-vercel-cron-with-croner`
- Task: implement the scheduler contract, persistent process entrypoints, deployment configuration, and runtime verification serially

#### Acceptance

- `npm run start` runs the existing Next.js application as a persistent Node service and `npm run cron:start` runs one independent persistent Croner service.
- The Cron service preserves all five schedules currently declared in `vercel.json`, calls the existing GET routes with `Authorization: Bearer ${CRON_SECRET}`, and never logs the secret.
- Each schedule uses UTC, prevents overlap within the Cron process, applies a bounded HTTP timeout, records concise structured results, and remains independently observable through a health endpoint.
- Missing or unsafe production configuration fails before schedules start; SIGTERM/SIGINT stops future triggers and gives in-flight requests a bounded grace period.
- Production documentation requires exactly one Cron service replica and an external process supervisor with automatic restart; missed-run backfill and durable execution remain owned by the existing database-backed domain queues/scanners rather than Croner.
- Vercel Cron declarations are removed only after the replacement entrypoint and contract tests are present.

#### Allowed Change Scope

- `scripts/cron-runner/**`, focused scheduler tests under `tests/**`
- `package.json`, `package-lock.json`, `.env.example`, `vercel.json`
- focused production/runtime documentation and OpenSpec/HarnessKit planning artifacts
- focused comments that still describe Vercel Cron as the production scheduler

#### Shared Contract Changes

- Adds `cron:start` and operational one-shot/dry-run scripts while preserving the existing `start` command for the persistent Next.js server.
- Adds server-only `CRON_RUNNER_BASE_URL`, optional health host/port, and bounded shutdown/request timeout configuration; `CRON_SECRET` remains the existing route-authentication secret.
- The five route paths and schedules remain unchanged; the process boundary changes from Vercel-managed scheduling to one supervised Croner service.
- Vercel function duration metadata may remain for compatibility, but `vercel.json` no longer owns recurring schedules.

#### Verification Plan

- smoke: strict OpenSpec validation, dependency lockfile consistency, scheduler configuration validation.
- targeted: fake-clock/fake-fetch contract tests for schedule parity, authentication, overlap protection, timeout, health state, and graceful shutdown.
- runtime: start a local authenticated probe server, run the actual Cron entrypoint in one-shot mode, and verify the received method/path/header without exposing the secret.
- full: production build plus HarnessKit verification; browser QA is not applicable because no browser-visible behavior changes.

#### Review Required

- reviewer: yes, scheduler correctness, shutdown behavior, and operational clarity
- security-reviewer: yes, secret handling, destination validation, and health endpoint exposure
- docs-researcher: no, the current Croner and Next.js contracts were verified from their official documentation before planning
- browser/QA: no, this is a server process and deployment change

#### Progress / Evidence

- status: complete
- branch/worktree: `main` in the current checkout; unrelated dirty user changes are preserved
- implementation: separate Web/Cron entrypoints, immutable five-job manifest, authenticated bounded invocation, overlap protection, health/readiness, one-shot mode, and graceful shutdown complete
- tests: 29 focused Cron unit/integration tests pass; strict OpenSpec, HarnessKit fast, diff hygiene, and security review pass
- runtime: actual one-shot and resident entrypoints verified against local authenticated probe servers, including health, SIGTERM, malformed request recovery, and secret-free output
- risks: Croner is in-memory, a second Cron replica duplicates triggers, process downtime misses occurrences, and long-running HTTP handlers still need their existing database recovery semantics

## Parallelization Decision

Classify every feature before assigning workers:

- `single-feature`: one feature; main agent can implement directly or create one worktree.
- `parallel-safe`: independent files/modules; can run in a feature worktree with one feature-worker.
- `parallel-with-contract`: can run in parallel only after the main agent defines the shared contract first.
- `serial-required`: must run after its dependency or after an earlier merge.
- `main-agent-only`: architecture, security, shared configuration, release, merge, or high-risk boundary work.

## Architecture and Contract Gate

- Shared interfaces, schemas, routes, CLI contracts, file formats, and permission boundaries are defined before worker assignment.
- Workers may not change shared contracts unless this plan grants ownership.
- OpenSpec is required project-owned context. Use root `openspec/changes/<change>/`, never `.harnesskit/openspec/`.

## Contract and Risk Verification

Default verification is contract-first and risk-based:

- `smoke`: syntax, generated-file presence, or one narrow command.
- `targeted`: tests or checks for the changed contract or user-visible behavior.
- `full`: cross-module, release-bound, browser-visible, security, data, or concurrency changes.
- `tdd`: use full TDD only for complex algorithms, state machines, regressions, or risk routing.

## Execution Plan

| Step | Owner | Action | Evidence |
| --- | --- | --- | --- |
| 1 | main-agent | Land database, types, and route contracts | Migration plus focused contract tests |
| 2 | main-agent | Implement services, request lifecycle, materializer, and prompt boundary | Targeted unit/integration tests |
| 3 | main-agent | Implement internal and public UI | Typecheck and component tests |
| 4 | reviewer/security-reviewer | Review correctness and security | Findings resolved |
| 5 | main-agent | Run real browser flow and full verification | Browser evidence and HarnessKit results |

## Merge Order

List the final merge order. Merge one by one, verify after each merge, and keep
unmerged worktrees intact if a merge or verification fails.

1. expert-validation (single feature; no merge split)
2. ui-localization (serial-required in current checkout; no merge split)
3. feeds-product and curated-explore (one shared feature branch because curated-explore depends on the personal Feeds BFF and Today UI)

## Final Evidence

- Per-feature changed files: recorded by the `add-feeds-product` and `add-curated-explore` OpenSpec task/evidence files and feature commit `2fc65c1`.
- Per-feature tests/checks: focused Feeds/Explore/auth/access/UI suites, TypeScript, both strict OpenSpec validations, no-lint production build, code/security review, and real browser acceptance.
- Merge order used: current main was integrated into `codex/add-feeds-product`; that combined Feeds/Explore branch is then fast-forwarded into main with autostash preserving local user edits.
- Final verification: after current-main integration, 77 conflict-focused tests, 56 access/CSP tests, TypeScript, strict OpenSpec validations, and `next build --no-lint` passed; normal build remains blocked by pre-existing repository-wide ESLint debt.
- Remaining risks: Miniflux and local Supabase must remain available at runtime; the project-wide Next.js advisory and repository lint debt remain separate maintenance issues.
