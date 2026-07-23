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
| curated-explore | Add a global read-only curated discovery view backed by one non-admin Miniflux user | feature-planning | `openspec/changes/add-curated-explore` | Authorized users can browse curated categories/articles and idempotently follow a trusted source into their personal Miniflux without shared read/save mutations or Reporting feed tables | single-feature | active Feeds product, Miniflux BFF, personal FeedService, Today reader | main-agent | `/home/ubuntu/workspace/reporting.worktrees/add-feeds-product` | in_progress |

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
- self-check: pending
- tests: pending
- risks: dynamic root rendering, mixed-language omissions, CJK wrapping/font fallback, shared-file overlap with existing user work

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

- status: in_progress
- branch: `codex/add-feeds-product`
- worktree: `/home/ubuntu/workspace/reporting.worktrees/add-feeds-product`; unrelated dirty user changes are preserved
- planning: separate `add-curated-explore` proposal, design, specification, and tasks created; latest contract intentionally excludes AEAD and V2 persistence/intelligence
- implementation: pending contract tests
- tests: pending
- reviews: pending
- browser: pending
- risks: collector token leakage, accidental collector state mutation, untrusted source refs, personal-account cross-write, and personal/collector failure coupling

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

## Final Evidence

- Per-feature changed files:
- Per-feature tests/checks:
- Merge order used:
- Final verification:
- Remaining risks:
