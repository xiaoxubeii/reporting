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
| comprehensive-site-e2e | Prove and repair the major FundWorkspace user journeys through one isolated, repeatable real-browser suite | feature-planning | `openspec/changes/add-comprehensive-site-e2e` | Disposable users and two Funds complete tenant onboarding/isolation, every enabled Search adapter, Feeds subscription/category/Explore/Trending/Deal Signals, Pitch-to-Memo investment decisions, mail/notifications, and the remaining primary route sweep with structured evidence; every reproducible product defect is fixed and rerun | serial-required | current main product, local Supabase, Web/Cron, Miniflux, SearXNG, configured AI/mail capabilities, Chromium | main-agent | `/home/ubuntu/workspace/reporting.worktrees/comprehensive-site-e2e` | planned |
| global-assistant-context | Replace page-local Analyst mounts with one authenticated global assistant and let supported front-end content become bounded conversation context | feature-planning | `openspec/changes/add-global-assistant-context` | One responsive assistant works across authenticated routes; desktop uses a 400px right dock that reflows content, narrower screens use full-height drawers, and supported snapshots use a full-height right-edge drag target plus accessible send action without changing trusted scope | main-agent-only | current Analyst shell/panel/API/conversations, Search, Feeds, Expert Directory, Dashboard Companies, Deals | main-agent | `/home/ubuntu/workspace/reporting.worktrees/global-assistant-context` | ready_to_merge |
| fund-identity-onboarding | Separate platform login identity from immutable per-Fund business identity, reserve the Fund subdomain at creation, add invitation-only membership and internal mailboxes, and split personal from Fund settings | feature-planning | `openspec/changes/add-fund-identity-onboarding` | External verified email remains the only login/recovery identity; Fund creation atomically reserves an immutable unique slug and owner membership; global personal profile, Fund-scoped immutable mailbox, invitation acceptance, role authorization, resumable setup, and existing Resend routing work across English/Chinese desktop/mobile flows without email-domain auto-join | serial-required | completed Fund subdomain isolation and multi-tenant Resend mail, current Supabase Auth/onboarding/membership/settings contracts, local Supabase | main-agent | `/home/ubuntu/workspace/reporting.worktrees/add-fund-identity-onboarding` | in_progress |
| institutional-platform-landing | Redesign the platform root as an institutional FundWorkspace investment-decision landing with real product evidence, optional expert validation, a configured demo CTA, and a non-enumerating workspace entry | feature-planning | `openspec/changes/redesign-platform-landing` | Platform `/` communicates Signal → Research → optional Expert Validation → IC → Portfolio/LP in English and Chinese with real screenshots and accessible responsive behavior; configured demo links are HTTPS-only; workspace entry performs syntax-only canonical tenant `/auth` navigation; tenant `/`, auth/app/portal, other public pages, and private-data boundaries remain unchanged; focused, build, review, and real browser verification pass | main-agent-only | current platform/tenant root split, public layout/auth redirect, next-intl, canonical Fund host helpers, verified expert-validation evidence | main-agent | current checkout | in_progress |
| multi-tenant-resend-mail | Add isolated FundWorkspace platform mail and per-Fund BYOK Resend business mail with secure outbound threads, tokenized replies, inbound routing, Pitch intake, and expert invitations | feature-planning | `openspec/changes/add-multi-tenant-resend-mail` | Platform and Fund credentials never cross; each Fund has an exact derived subdomain and Fund-scoped mailboxes; signed/idempotent Resend inbound routes deterministic replies; Pitch enters Deal screening; expert replies remain thread mail; Settings, focused tests, security review, and real local flows pass | serial-required | current email adapters, Fund envelope encryption, Supabase Auth SMTP operations, Deal intake, expert validation, local Supabase | main-agent | current checkout | in_progress |
| background-job-http-context | Preserve and enforce the initiating user or system identity across Cron-triggered HTTP-only background execution, then let Deal Research use the existing Reporting Search as an LLM-directed provider tool | feature-planning | `openspec/changes/add-background-job-http-context` | A Session-attributed Research request becomes a leased generic job; Croner authenticates only the dispatcher; every worker/Search hop carries an attempt-scoped short Job Token; each receiver restores and live-authorizes the actor; configured Anthropic or tool-capable OpenAI-compatible Deal Research chooses when to call existing `/api/search`; stale, forged, cross-fund, revoked, unsupported-tool, and replay cases fail closed | main-agent-only | current Croner/Deal Research, Search product, fund access, AI provider factory, local Supabase | main-agent | current checkout | complete |
| investment-decision-e2e | Prove and repair the real Pitch → Deal → research → Diligence → expert collaboration → evidence loop in an isolated worktree | feature-planning | Existing `add-expert-validation` and current Deal/Diligence contracts; create a new change only if a contract must change | One uniquely tagged public pitch becomes one fund-scoped Deal, Deal Research reaches a terminal result, promotion preserves the link to one Diligence record, Diligence Research exposes an expert-validation source, one public expert answer is submitted and materialized as immutable `industry_expert` evidence, and all discovered blockers receive focused regression coverage | single-feature | local Supabase and Storage, configured AI provider, Cron runner, existing Deal/Diligence/Expert Validation implementation | main-agent | `/home/ubuntu/workspace/reporting.worktrees/investment-decision-e2e` | in_progress |
| expert-validation | Close the Research gap/contradiction → expert answer → industry_expert → existing evidence pipeline loop | feature-planning | `openspec/changes/add-expert-validation` | Real internal and public browser flow works; one immutable submitted answer is materialized and enqueued with the documented security boundaries | single-feature | existing Diligence, email, AI, storage, job pipeline | main-agent | current checkout | in_progress |
| custom-ai-provider | Configure one generic OpenAI-compatible provider such as MiniMax or codex-lb | feature-planning | `openspec/changes/add-custom-ai-provider` | Admin can save key/base URL/model, select the complete provider as default, and existing AI factory uses it | main-agent-only | existing settings encryption, URL validation, OpenAI provider factory | main-agent | current checkout | complete |
| ui-localization | Add persistent English/Simplified Chinese UI switching without changing application URLs | feature-planning | `openspec/changes/add-zh-en-i18n` | Every user-visible page and shared chrome switch languages on the same URL, persist on reload, render the correct document language, and preserve business/access semantics | serial-required | all App Router visual pages and page-level components, shared navigation/authentication, current pathname-based middleware | main-agent | current checkout | in_progress |
| feed-category-popover | Select or create a Miniflux category from an anchored menu when following a personal source | feature-planning | `openspec/changes/add-feed-category-popover` | Follow opens a responsive accessible theme-aware folder picker for Uncategorized, existing categories, or inline new category creation; success refreshes the catalog and failure remains recoverable in context | serial-required | feeds-product, current Feeds localization slice, existing subscription mutation | main-agent | current checkout | complete |
| curated-source-catalog | Redesign Follow sources around a curated RSS directory and a personal category-grouped Following view | feature-planning | `openspec/changes/redesign-follow-sources-catalog` | Authorized users can browse/search curated Website/RSS sources, choose a personal category when following a trusted source, and manage subscriptions grouped only by their personal Miniflux categories | serial-required | curated-explore, feeds-product, feed-category-popover, current Feeds localization slice | main-agent | current checkout | complete |
| following-source-management | Make the personal Following view compact, unambiguous, and management-focused | feature-planning | `openspec/changes/optimize-following-source-management` | Following filters only the loaded personal catalog, renders compact collapsible personal-category groups, and exposes open/copy/unfollow actions per endpoint without changing Miniflux ownership or APIs | main-agent-only | curated-source-catalog, feeds-product, current Feeds localization slice | main-agent | current checkout | in_progress |
| devctl-service-manager | Manage every repository-owned local service from one safe CLI with conflict-free ports and verified ownership | feature-planning | `openspec/changes/add-devctl-service-manager` | `./devctl.sh` starts, stops, restarts, inspects, and tails Web, Croner, Miniflux, and SearXNG; reserves a complete 5000/5010/5020 port block; never controls the external Supabase stack or foreign processes/containers | main-agent-only | Node.js, npm, Docker Compose, existing service entrypoints, external Supabase reachability | main-agent | current checkout | complete |
| external-devctl-dependencies | Restrict devctl lifecycle ownership to Web/Cron and reuse operator-owned Miniflux/SearXNG | feature-planning | `openspec/changes/externalize-devctl-service-dependencies` | Default lifecycle commands manage only Web/Cron; configured Miniflux 8085, SearXNG 8086, and Supabase are status-only external dependencies; legacy Compose records are forgotten without container or volume mutation | main-agent-only | completed devctl-service-manager, operator-owned Miniflux/SearXNG, external Supabase | main-agent | current checkout | in_progress |
| feeds-product | Add personal Today and Follow sources backed exclusively by Miniflux APIs | feature-planning | `openspec/changes/add-feeds-product` | Approved users receive isolated Miniflux identities and can read, save, discover, categorize, follow, and unfollow through the authenticated Reporting BFF | serial-required | Miniflux V2, Reporting auth and approval workflow, Dealflow grants | main-agent | `/home/ubuntu/workspace/reporting.worktrees/add-feeds-product` | complete |
| curated-explore | Add a global read-only curated discovery view backed by one non-admin Miniflux user | feature-planning | `openspec/changes/add-curated-explore` | Authorized users can browse curated categories/articles and idempotently follow a trusted source into their personal Miniflux without shared read/save mutations or Reporting feed tables | serial-required | feeds-product, Miniflux BFF, personal FeedService, Today reader | main-agent | `/home/ubuntu/workspace/reporting.worktrees/add-feeds-product` | complete |
| feed-discovery | Add reusable semantic tags, deterministic Trending, evidence-gated Deal Signals, and a confirmed Feed-to-Deal handoff over the public Explore collector | feature-planning | `openspec/changes/add-feed-discovery` | Latest remains available; deployment-owned refresh atomically publishes explainable Trending and open Deal Signals through one fixed owner fund's validated default provider; authorized users can prefill and confirm the existing manual Deal flow from an article | single-feature | curated-explore, feeds-product, Croner, fixed owner-fund AI provider, Supabase | main-agent | `/home/ubuntu/workspace/reporting.worktrees/add-feed-discovery` | in_progress |
| croner-node-runtime | Replace Vercel Cron with one persistent Croner process while running the existing Next.js API routes on a persistent Node server | feature-planning | `openspec/changes/replace-vercel-cron-with-croner` | Production exposes separate Web and Cron start commands; the Cron process schedules the existing five authenticated routes with overlap protection, health reporting, bounded requests, and graceful shutdown; Vercel schedules are removed | main-agent-only | existing Next.js cron routes, `CRON_SECRET`, production process supervisor | main-agent | current checkout | complete |
| search-product | Add bounded federated Search across personal Feeds, Reporting SearXNG, and five direct professional sources | feature-planning | `openspec/changes/add-search-product` | Authorized users select fund-configured categories that resolve to code-reviewed adapters, receive safe normalized partial results with exact provenance, and use origin-correct result actions | serial-required | merged feeds-product, Reporting auth/access, dedicated SearXNG, five public source contracts | main-agent | `/home/ubuntu/workspace/reporting.worktrees/add-search-product` | complete |
| fund-subdomain-isolation | Preserve every route and access rule while binding each hosted Fund to `<fund-slug>.fundworkspace.com` across Landing, auth, GP app, LP Portal, APIs, tokens, and storage | feature-planning | `openspec/changes/add-fund-subdomain-isolation` | Same-Fund requests retain current behavior and paths; unknown/malformed/cross-Fund hosts, sessions, tokens, resource IDs, and cache entries fail closed; legacy self-host mode remains unchanged | main-agent-only | current Fund membership/RLS/access context, auth, LP links, public tokens, OAuth/MCP, background jobs, Storage, wildcard DNS/TLS | main-agent | `/home/ubuntu/workspace/reporting.worktrees/add-fund-subdomain-isolation` | complete |
| fund-public-site-templates | Give every hosted Fund a safe public homepage selected from three built-in templates while preserving platform marketing and product routes | feature-planning | `openspec/changes/add-fund-public-site-templates` | Fund admins author one structured bilingual draft, preview it privately, and explicitly publish an isolated immutable snapshot rendered as Focus, Institutional, or Minimal; platform `/`, tenant auth/app/portal, unknown hosts, and private data remain unchanged or fail closed | serial-required | completed fund-subdomain-isolation, current localization and Settings surfaces, local Supabase | main-agent | `/home/ubuntu/workspace/reporting.worktrees/add-fund-subdomain-isolation` | complete |

## Feature Requirement Contract

Copy this block for each planned feature. Keep it short; it is the shared
contract for self-check, review, testing, and merge.

### Feature: global-assistant-context

#### OpenSpec Decision

- Required: yes
- Reason: this is a cross-cutting authenticated UI, message contract, prompt-boundary, persistence, and security change.
- Change: `openspec/changes/add-global-assistant-context`
- Classification: `main-agent-only`; one shared AppShell/Analyst contract must land serially in the isolated worktree.

#### Acceptance

- Authenticated application routes with configured AI expose exactly one right-edge assistant launcher and panel; public/auth routes and the LP full-screen preview remain excluded.
- At 1280px and wider the panel is a fixed 400px full-height shell dock that reflows content; from 768px through 1279px it is a full-height 400px drawer, and below 768px it is near-full-width.
- Existing Company, Deal, Vehicle, LP, Diligence, and default Fund scopes retain their server-side authorization and context behavior.
- A versioned plain-text snapshot contract supports Search, Feed, Expert, Company, Deal, and future page content without DOM serialization, external fetching, resolvers, indexes, or a new table.
- Desktop drag/drop to a full-height right-edge target and localized keyboard/touch “Drag to Assistant” / “Send to Assistant” actions add equivalent context chips, open the panel, deduplicate items, and never auto-send.
- Active context persists until removed; the normalized active set is attached to each relevant user message in existing conversation JSON and restored from history without breaking legacy messages.
- The Analyst API strictly validates item count, lengths, kind/version, URL schemes, and control characters; provider messages remain role/content only and snapshots are injected as untrusted user reference material.
- Snapshot fields never change Fund/entity scope or authorize reads/writes; existing server tools and approvals remain authoritative.

#### Allowed Change Scope

- `openspec/changes/add-global-assistant-context/**`, focused HarnessKit plan/state/evidence.
- Shared Analyst shell/context/panel/API/conversation code and localized messages.
- Removal of duplicate page-local Analyst launchers/panels while preserving scope synchronizers.
- Search, Feed, Expert, Company, and Deal serializers and interaction affordances.
- Focused contract, component, integration, accessibility, and browser tests.

#### Shared Contract Changes

- Adds immutable `AssistantContextSnapshot` and extended Analyst conversation-message types without changing provider `ChatMessage`.
- Adds a Reporting-private drag MIME carrying an ephemeral in-memory token, not snapshot content.
- Extends `/api/analyst` messages with validated optional user contexts and scope-safe conversation update checks.

#### Verification Plan

- Contract-first tests for normalization, limits, prompt isolation, provider stripping, conversation persistence, legacy compatibility, and conversation-scope mismatch.
- React tests for provider lifecycle, singleton floating host, drag token handling, chips, explicit add, and no auto-send.
- Serializer/interaction coverage for Search, Feed, Expert, Company, and Deal, including Deal Board drag isolation.
- TypeScript, changed-file lint, strict OpenSpec, HarnessKit fast/targeted/full where applicable, full Vitest, production build, diff/secret scans.
- Authenticated desktop and 390px browser flows covering drag, explicit add, combined question, history restoration, scope preservation, console/network errors, and responsive containment.

#### Review Required

- Correctness review for singleton mounting, state lifecycle, message compatibility, and scope preservation.
- Security review for untrusted prompt material, request bounds, drag leakage, cross-fund/conversation isolation, and write-tool authority.
- UX/accessibility review for discoverability, keyboard/touch parity, drop feedback, chip management, focus, and mobile safe areas.

#### Completion Evidence

- Strict OpenSpec, TypeScript, changed-scope ESLint, production compilation with the unrelated global lint gate bypassed, diff/secret/bootstrap scans, and 63 focused tests pass.
- Full Vitest passes 258 files/1,830 tests; the only failure is the unrelated baseline-missing `docs/fund-email-resend.md` fixture.
- Authenticated desktop and 390px browser acceptance passes Search drag/add/question, Feed add, Expert/Company/Deal actions, context persistence/reset, no horizontal overflow, and clean relevant console/network checks.
- Correctness, security, and UI/UX re-reviews report no remaining High/Medium or P1/P2 finding.
- HarnessKit fast is blocked by the unrelated `feed-discovery: complete` state value; targeted is blocked by pre-existing repository-wide ESLint debt. Feature-scoped replacements pass.
- Evidence: `.harnesskit/evidence/add-global-assistant-context/verification.md` and captured browser artifacts in the same directory.

### Feature: fund-identity-onboarding

#### OpenSpec Decision

- Required: yes
- Reason: this is a browser-visible, security-sensitive authentication, tenancy, persistence, invitation, email-identity, localization, and authorization contract change.
- Change: `openspec/changes/add-fund-identity-onboarding`
- Classification: `serial-required`; schema and identity contracts must land before APIs, settings, invitation, mailbox, and browser work, and all later slices share the same Fund authority boundary.

#### Acceptance

- Every user and administrator registers, signs in, verifies, and recovers with an external Supabase Auth email; an internal Fund address is never accepted as an authentication identifier.
- A global personal profile owns real name and other person-level preferences, while Fund membership owns role and one optional immutable internal mailbox identity.
- Fund creation validates and atomically reserves one unique immutable slug, creates the founder as owner, initializes required settings, and never derives membership from an external email domain.
- Settings has distinct Personal and Current Fund navigation and authorization; the current Fund and immutable domain are always explicit.
- Administrators invite an exact external email with a bounded role and expiring single-use token; acceptance requires the same verified email and never performs domain matching.
- A live Fund member may claim one available non-reserved local part once; the address is derived from the trusted Fund slug, remains immutable, and inactive memberships cannot send or receive as that mailbox.
- Existing platform and Fund Resend connections, reserved business mailboxes, inbound routing, outbound sending, reply routing, and provider-secret isolation continue through the new identity model.
- A resumable localized setup checklist leads the founder through personal profile, mailbox, Fund branding, mail connection, and member invitations without making optional integrations a login gate.

#### Allowed Change Scope

- `openspec/changes/add-fund-identity-onboarding/**`, `docs/superpowers/**`, and focused HarnessKit plan/progress/evidence.
- Focused Supabase migrations, generated database types, tenancy/profile/invitation/mailbox repositories, and security tests.
- Fund onboarding, authentication guards, member/invitation APIs, personal and Fund settings APIs/components/layout, setup workflow, and localization messages.
- Existing Fund email settings/routing only where required to consume immutable Fund identity and membership-owned mailboxes.
- Focused unit, API, database integration, component, access, localization, and browser E2E tests.

#### Shared Contract Changes

- Add one global profile per auth user; external Auth email remains the login key and is not copied into a tenant-derived authorization rule.
- Treat the existing stable Fund slug/email subdomain as the immutable tenant business identifier and reserve it atomically during Fund creation.
- Replace email-domain join requests with exact-address invitation records whose token verifier is hashed, expiring, single-use, and Fund/role bound.
- Bind a normalized unique local part to one Fund membership and derive the full address server-side from the trusted Fund identifier.
- Split Settings DTOs/routes into personal and Fund authority domains; never accept a client-selected Fund id where Host/session membership already supplies authority.
- Reuse the completed multi-tenant Resend provider, webhook, reply-route, and secret-isolation contracts instead of creating a second email stack.

#### Verification Plan

- smoke: strict OpenSpec, migration/security contracts, HarnessKit fast, TypeScript, changed-scope lint, diff/secret scans.
- targeted: profile, slug reservation/concurrency, owner bootstrap, invitation replay/expiry/wrong-email/cross-Fund denial, mailbox uniqueness/immutability/reserved names, settings authorization, and existing email regressions.
- full: full Vitest, production build, code/security review, and real English/Chinese desktop/mobile browser flows from external signup through Fund creation, setup, invite acceptance, mailbox claim, and Fund email status.

#### Review Required

- planner/architect: yes, before implementation for identity ownership, migration, invitation, and tenancy contracts.
- reviewer: yes, after every implementation slice and for the whole branch.
- security-reviewer: yes, authentication separation, token hashing/replay, Host/Fund authority, RLS, role escalation, mailbox spoofing, and provider secrets.
- browser/QA: yes, creation/setup/invitation/settings are user-visible and require real authenticated validation.

#### Progress / Evidence

- status: in_progress
- branch: `codex/add-fund-identity-onboarding`
- worktree: `/home/ubuntu/workspace/reporting.worktrees/add-fund-identity-onboarding`
- baseline: full Vitest passes 285 files/1967 tests with 4 files/8 environment-gated tests skipped.
- evidence: pending implementation and verification.

### Feature: institutional-platform-landing

#### OpenSpec Decision

- Required: yes
- Reason: this is a browser-visible, localized, security-sensitive host-routing and anonymous-navigation contract change.
- Change: `openspec/changes/redesign-platform-landing`
- Classification: `main-agent-only`; the platform root, tenant-root bypass, public auth redirect, and shared landing localization must change under one owner.
- Selected task: `1.1` — add focused tests for demo URL and workspace-entry validation before implementation.

#### Acceptance

- Unauthenticated platform `/` renders the approved full-width institutional FundWorkspace landing; valid tenant `/` continues to render only the existing Fund public site/private state, and other public pages keep their existing chrome.
- The narrative is Signal → AI Research → Expert Validation when required → IC Decision → Portfolio & LP; expert validation is prominent but never described as mandatory for every Research run.
- Product evidence comes from verified non-sensitive real screenshots; overlays may explain but do not invent UI, metrics, customers, or results.
- `FUND_WORKSPACE_DEMO_URL` renders demo actions only for an absolute HTTPS value; missing or invalid configuration leaves no broken CTA.
- Existing-workspace input accepts only a valid slug or canonical tenant address, performs no Fund/membership lookup, and navigates to canonical `/auth` with generic invalid-input messaging.
- English/Chinese, 320px/mobile, 200% zoom, keyboard, visible focus, and reduced-motion behavior pass.

#### Architecture Path

- Existing trusted Host resolution in `app/(public)/page.tsx` remains authoritative and runs before platform content.
- `app/(public)/layout.tsx` classifies trusted Host mode on the server and delegates to `app/(public)/public-layout-client.tsx`; only hosted platform `/` receives the full-width shell, while tenant `/`, legacy self-host `/`, and non-root public routes retain their existing branches.
- Static localized sections live under `components/platform-landing/`; pure configuration and workspace-address parsing live under `lib/platform-landing/`.
- The public landing reads no Fund records, membership directory, Research/Expert services, feeds, external metrics, or new API.

#### Allowed Change Scope

- `openspec/changes/redesign-platform-landing/**`
- `docs/superpowers/plans/*platform-landing*.md`
- `.harnesskit/rules/feature-plan.md`, `.harnesskit/state/feature_list.json`, `.harnesskit/state/progress.md`, and feature evidence
- `app/(public)/page.tsx`, `app/(public)/layout.tsx`, `app/(public)/public-layout-client.tsx`
- `components/platform-landing/**`, `lib/platform-landing/**`
- focused tests, `messages/en.json`, `messages/zh-CN.json`, `public/landing/**`
- `.env.example` and existing deployment/readme documentation for the one optional setting

#### Shared Contract Changes

- New optional server setting: `FUND_WORKSPACE_DEMO_URL`, absolute HTTPS only.
- New platform-root shell branch and syntax-only workspace navigation to the existing canonical tenant `/auth` contract.
- No database, API, authentication, tenant descriptor, Fund public-site, or product-service contract change.

#### Verification Plan

- Contract-first Vitest for demo URL, workspace parsing, platform/tenant/public layout branching, localization, and static/no-private-dependency boundaries.
- HarnessKit fast after every edit; changed-scope ESLint/type checks, strict OpenSpec, targeted/full risk-routed tests, and production build.
- Real Chromium on platform desktop/mobile English/Chinese plus configured/unconfigured demo, keyboard workspace entry, reduced motion, console/network audit, tenant public site, tenant auth, GP app, LP Portal, and one other public page.
- Planner and TDD read-only review before edits; correctness, UI/accessibility, and security review before completion.

#### Merge Order

1. Implement in the current `main` checkout under the main agent.
2. Complete focused and browser verification without creating a feature worktree.
3. Commit only this feature's tracked files; preserve unrelated untracked evidence/assets.

### Feature: fund-public-site-templates

#### OpenSpec Decision

- Required: yes
- Reason: this is a browser-visible, security-sensitive persistence, publication, anonymous-data, tenancy, localization, and routing contract change.
- Change: `openspec/changes/add-fund-public-site-templates`
- Classification: `serial-required`; it directly depends on the uncommitted completed Fund-subdomain implementation in this worktree, so the main agent owns shared schema/API/routing contracts and read-only reviewers verify the plan and result.

#### Acceptance

- The platform hostname keeps the current FundWorkspace product site, while a valid tenant hostname's `/` renders only that Fund's published site or a uniform branded private state.
- Administrators select exactly Focus, Institutional, or Minimal; every template consumes the same strict bilingual structured content and template changes never discard content.
- Draft saves are private and revision-checked; publish atomically snapshots template and content, and unpublish hides the site without deleting the draft.
- Draft, publish, unpublish, and preview require an authenticated administrator whose Fund equals the trusted Host Fund; request data cannot choose a Fund.
- Anonymous resolution exposes only allowlisted published branding/content and never private settings, Deals, companies, LPs, performance, memberships, or draft history.
- Settings provides discoverable template selection, structured editing, desktop/mobile production preview, explicit publication state, and localized feedback.
- Existing tenant `/auth`, GP app, and `/portal` paths keep their current access and isolation behavior.

#### Allowed Change Scope

- `openspec/changes/add-fund-public-site-templates/**` and focused HarnessKit plan/progress/evidence.
- `supabase/migrations/**`, focused database types and public-site database tests.
- `lib/fund-public-site/**`, focused tenant request/access helpers, and authenticated public-site settings APIs.
- Tenant/platform root page and public layout branch, built-in public-site components, Settings entry/editor/preview, and localization messages.
- Focused schema, migration/RLS, route, component, settings, build, and browser tests.

#### Shared Contract Changes

- Add an isolated one-row-per-Fund `fund_public_sites` record with separate revisioned draft and published snapshots.
- Add one least-privilege exact-slug anonymous resolver plus atomic service-only publish/unpublish functions; deny direct table access.
- Add one strict versioned structured content contract shared by all three built-in templates and locale fallback helpers.
- Reuse the trusted Host-to-Fund administrator guard; never accept a client-selected Fund id.
- Branch exact tenant `/` away from platform product chrome and authenticated-user redirect while preserving all other paths.

#### Verification Plan

- smoke: strict OpenSpec, schema/migration contracts, HarnessKit fast, TypeScript, and diff/secret checks.
- targeted: strict content parser, real database RLS/RPC behavior, Host/Fund admin APIs, atomic revisions, template/render/routing, settings workflow, and localization parity.
- full: production build, code/security/accessibility review, and real platform plus two-Fund desktop/mobile browser flows through save, preview, publish, language switch, isolation, and unpublish.

#### Review Required

- planner/architect: yes, data boundary, publication lifecycle, and host routing before implementation.
- reviewer: yes, concurrency, content preservation, server/client route behavior, localization, and regression risk.
- security-reviewer: yes, definer functions, RLS/grants, Host/Fund confused deputy, XSS/URL validation, draft leakage, and cache isolation.
- browser/QA: yes, the tenant homepage and Settings workflow are user-visible and require real host-based verification.

#### Progress / Evidence

- status: complete
- branch: `codex/add-fund-subdomain-isolation`
- worktree: `/home/ubuntu/workspace/reporting.worktrees/add-fund-subdomain-isolation`
- evidence: strict OpenSpec, full Vitest (216 files/1618 tests), TypeScript, changed-scope ESLint, database audits, production compilation/route generation, correctness/security reviews, and 11/11 real browser checks pass.
- browser: platform marketing, two unpublished tenants, three-template lossless authoring, desktop/390px preview, publish, English/Chinese switch, two-Fund isolation, copied-session 404, and unpublish/draft preservation passed with zero feature-scope HTTP failures or page errors.
- build boundary: `next build --no-lint` passes with the local Supabase environment; normal build remains blocked by pre-existing repository-wide ESLint debt outside this change.

### Feature: fund-subdomain-isolation

#### OpenSpec Decision

- Required: yes
- Reason: this is a security-sensitive, browser-visible, cross-module tenancy contract spanning database identity, Host parsing, authentication, API authorization, public tokens, OAuth/MCP, Storage, links, and deployment.
- Change: `openspec/changes/add-fund-subdomain-isolation`
- Classification: `main-agent-only`; the central Host/Fund contract and shared middleware cannot be split safely across independent workers.

#### Acceptance

- External paths and current Landing, authentication, GP, LP Portal, feature, grant, and LP-status rules remain unchanged.
- Every configured `<fund-slug>.<root-domain>` resolves to one stable Fund; malformed, reserved, unknown, and attacker-suffix hosts fail closed.
- GP and LP browser/session requests proceed only when their live authorized Fund equals the Host Fund; one auth user is limited to one Fund across GP, direct LP, delegated LP, and dual-role graphs, and cookies remain host-only.
- Tenant-hosted signup, join, and onboarding cannot create or switch to a different Fund; wrong-Fund login clears the newly written host session before denial.
- Public Fund tokens, API keys, OAuth/MCP credentials, service-role resources, Storage operations, generated Fund links, and caches cannot cross Fund host boundaries.
- Background workers and inbound webhooks retain their stronger job/token/provider-derived Fund authority and never trust arbitrary Host for authorization.
- Legacy self-host deployments behave as before when tenant hosting is not configured.

#### Allowed Change Scope

- `openspec/changes/add-fund-subdomain-isolation/**` and focused HarnessKit plan/progress/evidence.
- `supabase/migrations/**`, generated database types, environment/deployment documentation.
- `lib/tenancy/**`, middleware, central access/API helpers, Supabase cookie/request helpers.
- Public/auth/root layouts and branding components, GP application layout, LP Portal resolver/layout.
- Focused public token, API key, OAuth/MCP, email/link, background-job/webhook, and Storage boundary integrations.
- Focused unit, migration-contract, integration, browser E2E, and security tests.

#### Shared Contract Changes

- Add stable constrained `funds.slug`, a cross-graph historical audit and write-time invariant, plus least-privilege exact-slug public descriptor and single-Fund LP context functions.
- Add explicit `FUND_WORKSPACE_ROOT_DOMAIN` tenant-hosting mode and one pure canonical Host classifier.
- Add one tested Host-class x route-authority registry before any current ungated route bypass.
- Add a trusted middleware-supplied tenant slug and require Host Fund equality before existing permissions.
- Keep route paths, one-account-one-Fund membership, roles/grants, LP statuses, and host-only session cookies unchanged.
- Build canonical Fund links from persisted slug and configured root domain; internal workers/webhooks keep non-Host authority.

#### Verification Plan

- smoke: strict OpenSpec, migration/static contracts, host parser, TypeScript, HarnessKit fast, and diff/secret checks.
- targeted: host parser attacks, middleware GP/LP matrix, auth mismatch, public tokens, OAuth/MCP, canonical links, service-role resource IDs, Storage, background/webhook exception behavior, and cache isolation.
- full: production build, HarnessKit full, code/security/UX review, and real browser same-Fund plus cross-Fund negative flows on local tenant hostnames.

#### Review Required

- planner/architect: yes, shared Host/Fund authority and migration sequence before implementation.
- reviewer: yes, middleware lifecycle, backward compatibility, cache behavior, callback/link correctness, and regression risk.
- security-reviewer: yes, Host spoofing, confused deputy, service-role/RLS, cross-Fund tokens/resources, cookie scope, OAuth, Storage, and webhook/job exceptions.
- browser/QA: yes, Landing, authentication, Dashboard, LP Portal, wrong-Fund login, and sibling-host cookie behavior are user-visible.

#### Progress / Evidence

- status: complete
- branch: `codex/add-fund-subdomain-isolation`
- worktree: `/home/ubuntu/workspace/reporting.worktrees/add-fund-subdomain-isolation`
- planning: proposal, design, three capability specs, and tasks pass strict validation.
- implementation: Fund identity/Host resolution 2.1-2.6, central request boundary 3.1-3.6, request-scoped branding/auth/onboarding 4.1-4.6, and non-session authority/canonical-link 5.1-5.6 are complete. Invited LP activation is checked against its persisted direct/delegated Fund before mutation; tenant onboarding never offers Fund creation; Portal chrome prefers the exact Host descriptor and rejects mismatched LP branding while legacy mode remains intact.
- verification: full Vitest (209 passed files, 1573 passed tests), disposable local PostgreSQL migration tests, production build with type validation, strict OpenSpec, HarnessKit fast, `git diff --check`, lint-delta comparison, and real Chromium Alpha/Beta tenant acceptance pass. HarnessKit targeted/full were run and remain blocked by repository-wide pre-existing ESLint debt; the changed files add no lint diagnostics versus `HEAD`.

### Feature: multi-tenant-resend-mail

#### OpenSpec Decision

- Required: yes
- Reason: this changes security-sensitive tenant credentials, outbound identity, inbound webhook authentication, email persistence, Deal intake, expert invitations, and Settings contracts.
- Change: `openspec/changes/add-multi-tenant-resend-mail`
- Task: implement serially from service-only persistence and credential boundaries through outbound threads, signed inbound routing, business workflows, Settings, and real verification.

#### Acceptance

- Platform Resend configuration is environment-only and never falls back to a Fund connection; Fund business mail uses only that Fund's encrypted BYOK credentials.
- Each Fund has one immutable DNS-safe mail slug, exact derived subdomain, reserved shared mailboxes, and optional user-owned local parts unique within the Fund.
- Outbound From and Reply-To identities are server-derived; messages, RFC headers, stable idempotency keys, and hashed high-entropy reply routes are durable before provider submission.
- Resend inbound resolves the Fund by a hashed route token, verifies exact raw Svix bytes, atomically deduplicates events/provider messages, retrieves bounded content with the selected Fund key, and quarantines ambiguous or unsafe input.
- Public `pitch@` mail creates one Fund-scoped Deal screening record without automatic Diligence evidence; expert email replies remain thread mail while the secure expert-response link stays authoritative.
- Bilingual Settings exposes only status and provider-managed webhook setup state; no API returns plaintext/ciphertext credentials or accepts caller-selected Fund, user, From, or Reply-To.
- Resend is a conditional branch of the existing outbound/inbound provider selectors, never a parallel settings card: outbound reuses `fund_settings` and its existing Resend key, while a Full Access receiving key causes the server to create/recreate the Resend webhook and persist its returned signing secret without a manual secret field.

#### Allowed Change Scope

- `openspec/changes/add-multi-tenant-resend-mail/**`, focused HarnessKit plan/progress/evidence.
- New forward-only Supabase migrations, generated database types, server environment and operations documentation.
- `lib/email*`, focused inbound pipeline adapters, connection/mailbox/thread services, access registry.
- Fund email Settings APIs/UI, Pitch intake integration, expert invitation service/routes, focused tests.

#### Verification Plan

- smoke: migration security contracts, strict OpenSpec, HarnessKit fast, secret scan, diff check.
- targeted: credentials/AAD, domain/mailbox validation, outbound identity/idempotency, raw-body webhook verification, event fencing, routing conflicts, Pitch and expert regressions, Settings authorization/localization.
- full: opt-in local Supabase concurrency suite, TypeScript, changed-scope lint, production build, correctness/security review, authenticated local Settings and expert invitation browser paths.
- external: one user-owned platform/Fund Resend DNS, send, inbound webhook, and reply test; if credentials are unavailable, record this operational gate explicitly without weakening code verification.

#### Review Required

- planner/architect: completed before implementation.
- reviewer: required after implementation for persistence, provider error semantics, routing, and workflow compatibility.
- security-reviewer: required for secrets, tenant resolution, raw webhook verification, replay/idempotency, headers, attachments, SSRF, PII, and authorization.
- browser/QA: required for bilingual Settings and the existing expert invitation flow.

#### Progress / Evidence

- status: in_progress
- branch/worktree: `main` in the current checkout; unrelated evidence, demo seed, and image artifacts are preserved.
- planning: the four OpenSpec artifacts are complete and `openspec validate add-multi-tenant-resend-mail --strict` passed before implementation.
- implementation: schema, isolated credentials, outbound/inbound adapters, Pitch intake, expert invitation, Settings API/UI, and operator documentation are implemented.
- verification: 20 focused files/103 tests, 2 live local-Supabase integration tests, TypeScript, changed-scope ESLint, strict OpenSpec, HarnessKit fast, secret/marker/diff checks, and `next build --no-lint` pass.
- browser: authenticated English/Chinese desktop and Chinese 390px mobile Settings pass with `/api/settings/fund-email` returning 200 and no product runtime errors; evidence is under `.harnesskit/evidence/add-multi-tenant-resend-mail/`.
- remaining: an independent final review plus a real expert-invitation/provider send/inbound/reply exercise require operator-owned Fund Resend credentials, DNS, and suitable local workflow data. HarnessKit targeted/full stop on pre-existing repository-wide ESLint debt outside this feature.

### Feature: background-job-http-context

#### OpenSpec Decision

- Required: yes
- Reason: this is a security-sensitive cross-module data, authentication, concurrency, HTTP, Search, and AI-provider contract change.
- Change: `openspec/changes/add-background-job-http-context`
- Task: implement serially from persistence and token contracts through dispatcher, HTTP context, Research/Search tool integration, provider loops, and real runtime verification.

#### Acceptance

- A user-initiated Deal Research request persists an immutable actor/fund association from the authenticated Session; system work is explicitly identified and cannot inherit a personal user identity.
- Croner continues to authenticate only with `CRON_SECRET`; a service-owned dispatcher atomically claims due work and signs a short-lived token bound to exactly one job attempt and trusted audience.
- Every downstream Research and Search call is HTTP; receivers reject invalid/expired/replayed/stale attempts, reload the job, live-check membership/access, match fund/resource/scope, and restore one immutable `BackgroundExecutionContext`.
- The existing `/api/search` preserves browser Session/Same-Origin/rate-limit semantics and adds a distinct fail-closed Job Token mode without accepting caller-selected actor, adapter, endpoint, scope, or limits.
- Deal Research uses the fund-configured provider and an LLM-directed Reporting Search tool; it does not hardcode Anthropic Web Search, duplicate Search execution, expose tokens to the model, or accept model-authored citations.
- Anthropic and tool-capable OpenAI/OpenRouter/custom endpoints complete the same bounded tool-loop contract; unsupported tool calling fails explicitly without falling back to ungrounded model memory.
- Source persistence derives only from Search results actually returned to the model, personal Feed state metadata is stripped, and job/tool limits, deadlines, retries, leases, dedupe, and terminal writeback are deterministic.

#### Allowed Change Scope

- `openspec/changes/add-background-job-http-context/**`, focused HarnessKit plan/progress/evidence.
- `supabase/migrations/**`, generated database types, server environment documentation.
- `lib/background-jobs/**`, focused access/rate-limit helpers.
- `scripts/cron-runner/**`, `app/api/cron/**`, internal Deal Research HTTP routes, `app/api/deals/[id]/research/route.ts`.
- `lib/deals/research*`, `lib/search/**`, `app/api/search/route.ts`, `lib/ai/**`.
- Focused unit, migration, route, integration, and runtime tests.

#### Shared Contract Changes

- Add one service-owned `background_jobs` queue with actor, fund, validated per-kind payload, dedupe, status, attempt, lease, retry, and audit fields.
- Add server-only `BACKGROUND_JOB_TOKEN_SECRET`; Job Tokens contain only trusted issuer/audience, job id, attempt id, issue time, and expiry.
- Add a code-owned job-kind policy registry mapping validated payload schemas to fixed worker paths and allowed route scopes; no database/client/LLM-controlled destination or scope.
- Add one shared `requireBackgroundExecutionContext` HTTP boundary and dual-mode `/api/search` authentication selected explicitly by the presence of a bearer token.
- Extend the existing provider tool-loop abstraction to OpenAI-compatible endpoints while preserving Anthropic behavior and failing closed on unsupported tools.

#### Verification Plan

- smoke: strict OpenSpec, migration/type/static secret contracts, HarnessKit fast, diff check.
- targeted: token/context authorization, queue claim/lease/retry/dedupe, dispatcher fixed-destination, Research enqueue/worker, Search dual-auth/tool projection, source provenance, Anthropic/OpenAI tool loops, changed-scope type/lint.
- full: production build, HarnessKit full, security/code review, and a real local Croner → dispatcher → Research HTTP → LLM tool → `/api/search` flow using an isolated user/fund/job.

#### Review Required

- planner/architect: yes, shared contract and execution sequence before implementation.
- reviewer: yes, concurrency, failure semantics, provider parity, and no duplicated Search path.
- security-reviewer: yes, token issuance/verification, confused-deputy, SSRF, RLS/service role, cross-fund access, replay, secrets, and personal Feed leakage.
- browser/QA: no new visual behavior; real authenticated API/runtime flow is required.

#### Progress / Evidence

- status: complete
- branch/worktree: `main` in the current checkout; unrelated localization and screenshot changes are preserved.
- planning: strict OpenSpec change `add-background-job-http-context` is valid; implementation tasks are complete.
- architecture: Croner calls `/api/cron/background-jobs`; the registry-driven dispatcher claims one globally bounded multi-kind batch, signs an attempt token, and POSTs only to fixed worker paths. Every later stage crosses HTTP and restores live context; Search is an optional policy capability.
- tests: the current feature-focused suite passes 18 files/131 tests and TypeScript passes. The current full Vitest run passes 177 files/1389 tests with one unrelated devctl test unable to bind port 5000 because the running Next server owns it; excluding that environmental test produces 177 files/1384 tests passing. Earlier correctness/security review suites and the clean-port full run also passed.
- runtime: the running Croner invokes `background-jobs` successfully. A persisted user-attributed job crossed generic Croner → dispatcher → Deal Research worker → `/api/search` three attempts; the database records one worker claim and nine completed Search tool calls. The provider's invalid evidence citations failed closed at the retry limit, and a freshly signed token for that terminal attempt received live HTTP 401.
- verification: HarnessKit fast, strict OpenSpec, `git diff --check`, generated-state parsing, focused tests, TypeScript, live HTTP replay rejection, and database object inspection pass. HarnessKit targeted remains blocked by existing repository-wide ESLint debt; file-level lint of the touched Anthropic provider reports six pre-existing `any` usages outside this change's diff.
- reviews: final correctness and security re-reviews found no remaining MEDIUM/HIGH/CRITICAL after generic lifecycle/domain projection separation, registry invariant hardening, POST-only bypass, required-kind binding, and Cron/Job secret separation.
- risks: the accepted at-least-once provider billing window remains; the configured OpenRouter model may emit citations that fail server provenance validation, which produces a safe terminal Research failure rather than ungrounded output.

### Feature: investment-decision-e2e

#### OpenSpec Decision

- Required now: no
- Reason: this lane validates already-specified Deal, Diligence, and Expert Validation behavior. If a discovered fix changes a user-visible or API contract, add or amend the relevant project-owned OpenSpec before implementation.
- Execution: isolate all browser tests, fixes, evidence, and commits in `/home/ubuntu/workspace/reporting.worktrees/investment-decision-e2e`.

#### Acceptance

- Submit one uniquely tagged pitch through the public token form and prove it creates exactly one fund-scoped inbound Deal.
- Open that Deal as an authorized fund member, request Deal Research, run the real Cron path, and record either a completed result with sources or the precise configured-provider failure without silently faking research.
- Promote the Deal exactly once and prove both the inbound Deal and newly created Diligence record retain their linkage.
- Run the existing Diligence ingest and Research stages until a contradiction or research gap can seed an expert-validation request.
- Create or select an isolated E2E expert, issue an invitation, open the real public response page, and submit a substantive answer.
- Prove the answer is immutable, materialized once as an `industry_expert` document, and enqueued into the existing ingest/evidence pipeline; then verify the Diligence UI reflects the new evidence.
- Capture desktop browser screenshots, console errors, failed network responses, and database/API linkage assertions for each stage.
- Add focused regression coverage for every in-scope blocker that requires code changes; pass focused tests, changed-scope lint/type checks, production build, security review, and the HarnessKit completion gate before commit.

#### Scope Guardrails

- Use a unique E2E identity, fund, pitch title, expert, and browser cookie namespace; never reset or migrate the shared local Supabase stack.
- Do not commit credentials, database rows, screenshots, browser profiles, `.next`, logs, or generated evidence unless the project explicitly tracks a compact test fixture or report.
- An unavailable external provider is evidence of an environment/configuration blocker, not permission to replace a real integration with mocked production behavior.

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

- status: complete
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

- status: complete
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

- status: complete
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

- status: completed
- branch: `main`
- worktree: current checkout; unrelated localization and branding changes are preserved
- commit: included in the current main-branch submission
- tests: 14 focused compact/theme-aware UI regression tests passed; changed-file ESLint has 0 errors and one existing image warning; strict OpenSpec and diff checks passed
- browser: authenticated desktop and 390px mobile category flows passed; the final shared compact semantic-token picker was also exercised through the curated Follow flow and retained focus restoration and viewport fit
- reviews: compact styling code review found no correctness or accessibility issue; a native-disabled regression for already-followed discovery rows was fixed before commit
- verification gaps: repository-wide TypeScript remains blocked by unrelated errors from the concurrently changing localization scope, with 0 diagnostics in the changed feed scope
- risks: shared-file overlap with the still-active localization change; existing app-shell accounting 403 and Vercel Analytics CSP console noise remain outside this feature

### Feature: curated-source-catalog

#### OpenSpec Decision

- Required: yes
- Reason: This redesign adds a user-visible source-directory contract and changes the navigation and interaction model of Follow sources.
- Change: `openspec/changes/redesign-follow-sources-catalog`
- Task: implement `tasks.md` serially from read-only collector contracts through the real browser flow.

#### Acceptance

- `/feeds/sources` defaults to an URL-backed Explore sources view and offers a separate URL-backed Following view.
- Explore remains browsable without a working personal Miniflux connection and shows stable category cards with one deterministic representative source, without redundant source counts.
- Text search filters the curated directory; Website/RSS URLs continue through the existing SSRF-safe discovery and personal category picker.
- A category opens a responsive Sheet listing its curated sources and current Follow state; Follow sends only a trusted source reference and writes only to the current user's Miniflux.
- Curated Follow reuses the personal category picker; only the trusted source reference and a bounded category choice cross the client boundary.
- Following groups sources directly by the user's personal Miniflux categories, omits empty categories, places Uncategorized last, and removes the redundant topic-card/Sheet directory.
- Following preserves personal connection/provisioning recovery, source health, filtering, and unfollow behavior.
- The first release presents Website/RSS only and does not expose unsupported source types, fake language controls, collector feed URLs, or Reporting feed persistence.

#### Allowed Change Scope

- `lib/feeds/explore-service.ts`, `lib/feeds/service.ts`, and focused service contracts
- `app/api/feeds/explore/sources/**`, focused access/route registration
- `components/feeds/follow-sources.tsx`, shared category-picker and curated catalog components, and Feeds client types
- `messages/en.json`, `messages/zh-CN.json`
- focused tests and OpenSpec/HarnessKit planning artifacts

#### Shared Contract Changes

- Add a read-only curated source directory endpoint with optional bounded category and text filters.
- Extend curated category summaries with one deterministic representative source derived from collector order.
- Preserve namespaced source/category references and server-side collector ownership checks.
- Keep curated browsing, personal connection state, and personal Follow-state projection independently recoverable.
- Allow the trusted Explore Follow route to accept only an optional bounded personal category name in addition to the URL path source reference.
- Keep personal Miniflux as the sole authority for Following group membership; add no Reporting category state.

#### Verification Plan

- smoke: strict OpenSpec validation, HarnessKit fast, changed-scope lint/type checks.
- targeted: Explore service/API/access/UI/localization tests, including output redaction and failure independence.
- full: HarnessKit targeted/full plus real authenticated English/Chinese desktop and 390px mobile browsing, search, category, Follow, refresh, and Following flows.

#### Review Required

- reviewer: yes, shared state and behavior correctness
- security-reviewer: yes, SSRF, trusted-reference, authorization, and collector read-only boundaries
- browser/QA: yes, this is a responsive user-visible redesign

#### Progress / Evidence

- status: in_progress
- branch/worktree: `main` in the current checkout; unrelated dirty user artifacts are preserved
- implementation: category-aware trusted Follow and direct personal-category grouping are complete in the curated directory and separate Following view
- verification: 103 focused tests passed; changed-scope lint/type checks, strict OpenSpec, HarnessKit fast, code/security review, and authenticated desktop/mobile English/Chinese browser acceptance passed; repository-wide targeted lint remains blocked by unrelated existing errors
- evidence: `.harnesskit/evidence/redesign-follow-sources-catalog/`
- commit: included in the current main-branch submission

### Feature: following-source-management

#### OpenSpec Decision

- Required: yes
- Reason: This is a user-visible behavior and interaction change on an existing source-management route.
- Change: `openspec/changes/optimize-following-source-management`
- Task: implement `tasks.md` serially without changing the personal Miniflux or subscription API contracts.

#### Acceptance

- Explore keeps curated and website/RSS discovery; Following provides only a local personal-source filter plus navigation back to Explore.
- Non-empty personal Miniflux categories render as compact open-by-default disclosure groups, with Uncategorized last.
- Every followed endpoint remains independently actionable while single-endpoint sources do not repeat their title or raw RSS URL in the default row.
- Each endpoint exposes localized Open source, Copy RSS, and Unfollow actions; clipboard failure and mutation failure remain recoverable in context.
- The optimized view remains accessible and overflow-free in English and Simplified Chinese at desktop and mobile widths.

#### Allowed Change Scope

- `components/feeds/follow-sources.tsx` and one focused Following source-actions component.
- `messages/en.json`, `messages/zh-CN.json`.
- Focused feed UI behavior/localization tests.
- `openspec/changes/optimize-following-source-management/**` and focused HarnessKit plan/progress/evidence.

#### Shared Contract Changes

- No route, database, Miniflux ownership, category persistence, or permission changes.
- Following local filtering expands to personal category and endpoint metadata already present in the loaded projection.
- The actions menu invokes only current public URLs, clipboard APIs, and the existing authenticated Unfollow callback.

#### Verification Plan

- smoke: strict OpenSpec, HarnessKit fast, changed-scope lint/type checks, and diff check.
- targeted: feed UI behavior/localization tests plus source-actions interaction coverage.
- full: code/accessibility/security review and authenticated English/Chinese desktop and 390px mobile browser verification.

#### Review Required

- planner: yes, minimal scope and multi-endpoint behavior before implementation.
- reviewer: yes, state, filtering, and endpoint mutation identity.
- security-reviewer: yes, external-link isolation, clipboard error handling, and no new mutation boundary.
- browser/QA: yes, responsive user-visible management workflow.

#### Progress / Evidence

- status: in_progress
- branch/worktree: `main` in the current checkout; unrelated dirty changes are preserved.
- planning: OpenSpec proposal, design, specification, and tasks are apply-ready.
- tests/browser/reviews: pending.

### Feature: devctl-service-manager

#### OpenSpec Decision

- Required: yes
- Reason: This introduces a cross-service CLI, runtime ownership model, and local port contract.
- Change: `openspec/changes/add-devctl-service-manager`
- Task: implement `tasks.md` from failing lifecycle tests through the real CLI path.

#### Acceptance

- `./devctl.sh` supports `start`, `stop`, `restart`, `status`, and `logs` for Web, Croner, Miniflux, and SearXNG, with all services selected by default.
- A complete ten-port block is reserved at 5000, then 5010, 5020, and so on; Web/Cron/Miniflux/SearXNG use offsets 0/1/2/3.
- State, logs, generated development secrets, PIDs, process groups, and Compose project ownership remain checkout-local under `.devctl/`.
- Repeated commands are idempotent, partial startup rolls back only newly created resources, and stale/foreign PIDs or containers are never stopped.
- The configured Supabase service is observed as an external dependency and is never started or stopped.

#### Allowed Change Scope

- root `devctl.sh`, `scripts/devctl/**`, focused tests/fixtures
- `scripts/miniflux-local.sh` only if required for an isolated Compose project name
- `.gitignore`, README local-development documentation
- focused OpenSpec and HarnessKit planning/state artifacts

#### Shared Contract Changes

- No production service contract changes.
- Local Web, Cron health, Miniflux, and SearXNG URLs become dynamically derived from the selected port block when launched through devctl.
- Existing standalone npm, Compose, and Miniflux script entrypoints remain valid.

#### Verification Plan

- smoke: shell syntax, strict OpenSpec validation, HarnessKit fast, diff check.
- targeted: port allocation and lifecycle Vitest suites with fake processes/Compose commands; changed-scope lint/type checks.
- full: real CLI Web/Cron lifecycle plus default-service preflight; browser verification is not applicable to a CLI-only change.

#### Review Required

- reviewer: yes, lifecycle correctness and safe rollback
- security-reviewer: yes, PID ownership, secret handling, and command construction
- browser/QA: no, CLI-only; real CLI verification is required instead

#### Progress / Evidence

- status: in_progress
- branch/worktree: `main` in the current checkout; unrelated untracked artifacts are preserved
- implementation: unified lifecycle, ten-port allocation, protected state/secrets, process-group ownership, isolated Compose projects, external Supabase status, documentation, and focused tests complete
- verification: 24 focused tests, changed-scope lint, repository typecheck, syntax/Compose config, strict OpenSpec, HarnessKit fast, real 5000 and conflict-driven 5010 CLI flows, and the complete default stack passed; code/security review has no remaining blocker/high; HarnessKit targeted remains blocked by unrelated repository-wide lint debt
- risks: Docker/VPN availability, shared Compose names, stale PID reuse, and unrelated repository-wide type/lint failures
- commit: not requested

### Feature: external-devctl-dependencies

#### OpenSpec Decision

- Required: yes
- Reason: this changes the CLI lifecycle, ownership, port, state migration, and external dependency contracts established by `add-devctl-service-manager`.
- Change: `openspec/changes/externalize-devctl-service-dependencies`
- Task: implement contract-first from failing lifecycle/probe tests through a real Web/Cron-only runtime restart.

#### Acceptance

- `./devctl.sh start`, `stop`, `restart`, and `logs` accept and manage only Web and Cron; Miniflux, SearXNG, and Supabase are never lifecycle targets.
- Status probes configured external Miniflux, SearXNG, and Supabase with bounded side-effect-free requests and reports their sanitized origins independently from the managed aggregate.
- Web/Cron preserve `.env.local` Miniflux/SearXNG endpoints and token paths instead of deriving checkout-specific 5002/5003 values.
- Legacy Miniflux/SearXNG records are removed from devctl state without Docker stop/down/recreate/volume operations; already-created duplicate containers remain an explicit operator cleanup item.
- The real default CLI starts only Web/Cron and reconnects them to the running Reporting Miniflux 8085 and SearXNG 8086 instances.

#### Allowed Change Scope

- `devctl.sh`, `scripts/devctl/**`, focused devctl tests and local-development documentation.
- `openspec/changes/externalize-devctl-service-dependencies/**` and focused HarnessKit plan/progress evidence.
- No Feeds/Search API, database, external container, volume, or credential mutation.

#### Shared Contract Changes

- Managed lifecycle service names become exactly `web` and `cron`.
- External dependency descriptors become `miniflux`, `searxng`, and `supabase`; they expose status only and never enter managed state.
- The ten-port block remains for checkout collision isolation, but only offsets `+0` and `+1` are assigned.

#### Verification Plan

- smoke: strict OpenSpec, HarnessKit fast, syntax, and diff check.
- targeted: CLI parsing, manager lifecycle/rollback, legacy state sanitation, external probe/status, adapter environment, and changed-scope lint/type checks.
- runtime: restart the actual CLI, verify Web/Cron and external 8085/8086 status, and compare Docker container identities before/after.

#### Review Required

- planner: main-agent architecture/contract gate before implementation.
- reviewer: yes, lifecycle, state migration, and diagnostic accuracy.
- security-reviewer: yes, URL validation, redirect behavior, secret/log safety, and no external mutation.
- browser/QA: no; CLI/runtime behavior only.

#### Progress / Evidence

- status: in_progress
- branch/worktree: `main` in the current dirty checkout; all unrelated changes are preserved.
- implementation: devctl adapters, lifecycle names, ports, child environment, rollback-compatible state sanitation, external probes, CLI output, and documentation complete.
- tests: 32 focused tests pass; full Vitest passes 179 files and 1398 tests.
- verification: repository TypeScript, changed-scope ESLint, strict OpenSpec, HarnessKit fast, syntax, and diff hygiene pass; HarnessKit targeted is blocked only by unrelated repository-wide lint debt.
- runtime: real Web/Cron restart passed at 5010/5011; status reports Miniflux 8085, SearXNG 8086, and Supabase 8000; all observed external and legacy duplicate container identities/start times were unchanged.
- review: correctness and security re-reviews closed the rollback-compatibility, base-path probing, and non-loopback HTTP findings; no MEDIUM/HIGH/CRITICAL remains.
- cleanup: legacy duplicate Miniflux/SearXNG containers on 5002/5003 remain operator-owned cleanup and were not mutated.

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

### Feature: search-product

#### OpenSpec Decision

- Required: yes
- Reason: this is a browser-visible, security-sensitive federated feature crossing authenticated Miniflux, an operator-owned metasearch service, public APIs, and bounded website parsing.
- Change: `openspec/changes/add-search-product`
- Task: preserve the verified first milestone, then implement the Category-to-Adapter increment serially through contracts, fund-admin configuration, unified execution, UI, review, and real browser verification.

#### Acceptance

- An authorized caller explicitly submits one bounded plain-text query and selects available fund-configured categories.
- Reporting resolves categories to one code-owned adapter registry/executor and never exposes adapter IDs, Miniflux, SearXNG, source endpoints, engines, or parser controls to the browser.
- Fund administrators can atomically manage ordered bilingual category presentation, enablement, defaults, and registered adapter mappings for their own fund.
- PubMed, ClinicalTrials.gov, FDA/openFDA, TCTMD, and MassDevice are queried directly through reviewed adapters; professional search never falls back to SearXNG `site:` queries.
- Concurrent source failures produce source-level statuses and useful partial results; fixed limits are 10 Feed, 10 Web, 5 per professional source, and 30 final results.
- Exact URL and stable-identifier duplicates preserve all provenance, use `Feed > Specialized > Web` primary-origin precedence, and retain origin-correct reader/external-link behavior.
- Access, source enablement, per-user rate limiting, query privacy, bounded plain-text rendering, public-URL validation, desktop/mobile accessibility, and reader focus restoration are verified.

#### Allowed Change Scope

- `openspec/changes/add-search-product/**`
- `lib/search/**`, focused reuse of `lib/feeds/**`, access metadata, route declarations, source/category configuration, database types, and a forward-only migration
- `app/api/search/**`, `app/api/settings/search-categories/**`, `app/(app)/search/**`, Search/Settings components, and the existing sidebar
- Reporting-owned SearXNG Compose/configuration, `.env.example`, deployment/runbook documentation, fixtures, focused tests, and browser evidence
- HarnessKit plan/state/progress evidence only

#### Shared Contract Changes

- Adds `dealflow.search` while keeping Feed search dependent on existing permitted Feeds read access and the caller's personal Miniflux identity.
- Adds one validated authenticated `POST /api/search` contract with selected category IDs, normalized adapter-level hits/statuses, and no client-controlled adapter IDs, endpoints, engines, selectors, or limits.
- Adds fund-scoped `search_category_config` plus an admin-only same-origin Settings boundary; the visible catalog is data-driven while adapter implementations remain code-owned.
- Uses `CategoryResolver`, `AdapterRegistry`, and `AdapterExecutor` without a separate Provider layer.
- Adds a separately pinned, loopback-only Reporting SearXNG service with an operator-owned General/News engine allowlist and independent secret.
- Adds no Reporting search index, history, arbitrary crawling, paid API credentials, quota ledger, federated pagination, fuzzy/AI deduplication, or AI reranking.

#### Verification Plan

- smoke: contract tests, OpenSpec strict validation, SearXNG configuration/Compose validation, and HarnessKit fast.
- targeted: category configuration/resolution, registry/executor and adapter fixtures, merge/URL/security behavior, route authorization/rate limiting/privacy, Settings editor, and Search component contracts.
- full: TypeScript, targeted lint, full tests/build where baseline permits, Search E2E, code/security review, and real authenticated desktop/mobile browser verification against Reporting's actual entrypoint.

#### Review Required

- planner: yes, contract/sequence review before implementation
- reviewer: yes, category resolution, adapter registry/executor, normalized contracts, deterministic merge, and UI integration
- security-reviewer: yes, credentials, SSRF/redirects, untrusted HTML, URL safety, access, rate limits, privacy, and external-link isolation
- docs-researcher: yes, official API parameters/responses and current public website search contracts
- browser/QA: yes, the route, source drawer, partial/error states, Feed reader, and external actions are user-visible

#### Progress / Evidence

- status: complete
- branch: `main` (merged from `codex/add-search-product`)
- worktree: `/home/ubuntu/workspace/reporting`; unrelated dirty changes in the feature worktree and untracked main-worktree artifacts were preserved
- planning: OpenSpec `spec-driven`; proposal/design/spec/tasks fully read; all 46 tasks complete
- architecture: serial-required after merged Feeds; fund-scoped category JSON uses the existing fund-admin boundary, and one Adapter abstraction handles Feed, Web, API, and Website search
- tests: pre-merge Category-to-Adapter focused suite passed with 20 files/92 tests; post-merge full suite passed with 157 files/1268 tests, with 2 files/4 environment-gated integration tests skipped
- browser: authenticated admin changed the `internet` category label and mapping from `web` to `pubmed`; the Search page immediately rendered the new label as selected and returned live PubMed results, including in the mobile category drawer; the original `Internet -> web` configuration was restored
- reviews: code, database, and security reviews completed with no blocker/high/medium findings; merge review removed SearXNG from the shared proxy network and retained port 8118 egress through an explicit host-gateway mapping
- baseline: OpenSpec strict, HarnessKit fast, TypeScript, Compose validation, changed-file ESLint, full Vitest, and `next build --no-lint` pass; HarnessKit targeted/full stop on repository-wide pre-existing ESLint errors outside Search
- risks: category configuration must remain fund-scoped and data-only; unknown adapter IDs fail closed; external API/engine availability and website parser drift remain operational partial-result states

### Feature: expert-directory-discovery

#### OpenSpec Decision

- Required: yes
- Reason: this adds a browser-visible, fund-scoped resource workflow across persistence, external discovery, expert matching, and authorization.
- Change: `openspec/changes/add-expert-directory-discovery`
- Classification: `single-feature`, serial-required because the candidate and certification contracts must land before API and UI consumers

#### Acceptance

- Reporting exposes one authenticated Expert Directory with separate Platform Certified, Fund Experts, and Fund Discovery views.
- Platform experts remain globally visible and platform-managed; fund experts remain visible only to their fund and record whether they were manually added or promoted from discovery.
- Fund admins can discover candidates from approved medical sources, inspect source-backed evidence, confirm a candidate into a fund expert, and reject candidates; unconfirmed candidates never participate in Research matching or invitations.
- Existing Diligence expert validation lists and auto-matches active platform experts plus the current fund's confirmed experts, with origin and verification badges.
- Discovery is bounded, input-validated, rate-limited, fund-isolated, and never invents email addresses or automatically sends invitations.

#### Allowed Change Scope

- `supabase/migrations/`, generated database types, expert-validation and expert-discovery domain modules, Expert APIs, Diligence expert selector, sidebar/access contracts, locale catalogs, `/experts` UI, focused tests, and browser evidence.
- Existing unrelated worktrees, demo data scripts, screenshots, and diligence-language changes remain untouched.

#### Shared Contract Changes

- Adds fund-scoped expert candidate persistence and explicit source/verification metadata for formal experts.
- Adds authorized discovery/list/confirm/reject routes and extends Expert Directory DTOs with certification and provenance.
- Reuses Reporting Search's approved-source policy and bounded API transport; expert-specific discovery adapters normalize people while promotion remains an expert-domain concern.

#### Verification Plan

- Contract-first tests for schema constraints, fund isolation, candidate normalization/deduplication, promotion idempotency, permissions, and exclusion from matching.
- Targeted service/API/UI tests, generated database types, TypeScript, changed-file lint, strict OpenSpec, and `git diff --check`.
- Authenticated desktop/mobile browser verification for all directory tabs, manual creation, discovery, confirmation, and selection in an existing Diligence expert-validation request.

#### Review Required

- planner: yes, architecture and contract review before implementation
- reviewer: yes, candidate lifecycle, promotion idempotency, reuse of Search adapters, and UI integration
- security-reviewer: yes, external inputs, fund isolation, privileged global writes, rate limiting, and contact-data handling
- browser/QA: yes, directory and Diligence integration are user-visible

#### Progress / Evidence

- status: complete
- branch: `codex/add-expert-directory-discovery`
- worktree: `/home/ubuntu/workspace/reporting.worktrees/add-expert-directory-discovery`
- owner: main-agent
- implementation: two formal expert pools plus a fund-private candidate queue; admin-only manual/discovery management; PubMed and ClinicalTrials.gov discovery adapters; atomic fund confirmation; trust snapshots; and Diligence selection are complete
- authorization: normal members have read-only access to the two expert pools; fund admins manage only their fund; platform writes require the configured operations fund; candidate RPCs require service role plus a live fund-admin membership and force fund-confirmed scope
- tests: full Vitest passes with 186 files and 1426 tests (3 files/5 tests skipped); database migration/concurrency tests, TypeScript, 32-file changed-scope ESLint, strict OpenSpec, and `git diff --check` pass
- browser: authenticated desktop flow passed manual create/deactivate/reactivate, live discovery, explicit confirmation, fund visibility, and Diligence selection; 390px mobile Expert Directory has zero horizontal overflow
- security: fixed HTTPS upstreams, bounded API transport, same-origin mutation checks, fail-closed rate limits, strict input limits, RLS/service-role grants, atomic row locking, cross-fund tests, safe browser errors, and a 52-file secret scan produced no medium/high/critical finding
- baseline: `next build --no-lint` passes; regular build and HarnessKit targeted/full stop on repository-wide pre-existing ESLint errors outside this change. `npm audit` cannot run against the current invalid package tree and unchanged lockfile
- evidence: `.harnesskit/evidence/add-expert-directory-discovery/`

### Feature: feed-discovery

#### OpenSpec Decision

- Required: yes
- Reason: this is a browser-visible, cross-boundary capability adding persistent derived data, scheduled AI processing, public Explore APIs, and a Deal intake handoff.
- Change: `openspec/changes/add-feed-discovery`
- Task: implement `tasks.md` contract-first from migrations and semantic enrichment through Trending, Deal Signals, Explore UI, Deal prefill, review, and real browser verification

#### Acceptance

- Public Explore articles are processed incrementally and idempotently without reading or persisting personal subscription, read, or saved state.
- Each unique public article receives one cached, versioned semantic enrichment with entities, concepts, events, evidence, and confidence.
- Trending is ranked deterministically from clustered article volume, distinct source count, growth, and freshness; AI does not determine the trend score.
- Deal Signals use deterministic prefiltering plus structured AI classification, and only explicit open opportunities with evidence pass the display gate; completed financing remains news and cannot be promoted as an open Deal.
- Explore exposes `Latest / Trending / Deal Signals`; both ordinary articles and Deal Signals can open the existing manual Deal form with source context prefilled, while final Deal creation continues through `/api/deals/manual`, existing dedupe, and Deal Research.
- Fund-thesis personalization, personal-feed background scanning, automatic Deal creation, behavior-based ranking, and custom-model training remain out of scope.

#### Allowed Change Scope

- `openspec/changes/add-feed-discovery/**`
- `supabase/migrations/**`, generated database types, and focused migration/contract tests
- `lib/feeds/**`, focused AI provider integration, discovery scheduling, and route-domain/access contracts
- `app/api/feeds/explore/**`, the Croner service registry/configuration needed for one refresh endpoint, `app/(app)/feeds/**`, `components/feeds/**`, and the existing manual Deal dialog integration point
- locale messages, `.env.example` only when required, focused tests, browser evidence, and HarnessKit plan/state/progress evidence

#### Shared Contract Changes

- Adds derived semantic-enrichment and discovery-result persistence with explicit Data API grants and access policies; Miniflux remains authoritative for source articles.
- Adds versioned semantic enrichment, Trending result, and Deal Signal DTOs plus an authenticated Explore discovery read contract.
- Adds an authenticated internal refresh route invoked by the existing Croner runtime; refresh is idempotent and deployment-scoped rather than forced into fund-scoped `background_jobs`.
- Extends the existing manual Deal creation UI with trusted server-provided article prefill; it does not create a second Deal ingestion pipeline.

#### Verification Plan

- smoke: strict OpenSpec validation, migration/schema checks, route allowlist and scheduler configuration tests, bootstrap marker guard.
- targeted: semantic schema/parser tests, deterministic clustering/ranking tests, Deal Signal gate tests, refresh idempotence, API/access tests, and UI/prefill contract tests.
- full: TypeScript, lint status, focused/full tests, production build, code/security/UI review, and real authenticated desktop/mobile Explore-to-Deal browser flow.

#### Review Required

- planner: yes, contract/sequence review before implementation
- reviewer: yes, architecture-path use, deterministic strategy correctness, UI consistency, and regression risk
- security-reviewer: yes, Cron authentication, server-only AI credentials, RLS/grants, untrusted article content, prompt-injection containment, and Deal prefill validation
- browser/QA: yes, the feature is browser-visible and crosses Explore, AI-derived data, and Deal creation
- parallelization: `single-feature`; task groups execute in dependency order from persistence through refresh/API and UI, with the main agent owning shared contracts and implementation in `codex/add-feed-discovery`

#### Progress / Evidence

- status: complete
- branch/worktree: `codex/add-feed-discovery` in `/home/ubuntu/workspace/reporting.worktrees/add-feed-discovery`
- ownership: authenticated reads derive the fund from verified membership; scheduled work derives it from signed persisted job context; Provider, cache, refresh state, and results are fund-scoped with no Discovery fund/provider environment configuration
- planning: OpenSpec proposal, design, specification, and all tasks are complete and pass strict validation
- implementation: shared semantic enrichment, deterministic Trending, independent Deal classification, immutable publication, Croner/API integration, Explore UI, and confirmed Feed-to-Deal handoff are complete
- verification: 1,525 tests pass; TypeScript, changed-file ESLint, production build with repository lint bypass, isolated PostgreSQL fund-isolation and scheduler-cursor regressions, strict OpenSpec validation, and authenticated desktop/mobile browser evidence pass
- bounded baseline issues: repository-wide `next build` lint remains blocked by pre-existing lint debt; full local Supabase bootstrap remains blocked by the pre-existing `compliance_seed` null `regulation_url` row

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
4. search-product (serial after feeds-product; merged from its isolated feature worktree)
5. fund-subdomain-isolation (single security-sensitive feature on `codex/add-fund-subdomain-isolation`; merge only after full cross-Fund and browser verification)

## Final Evidence

- Per-feature changed files: recorded by the `add-feeds-product` and `add-curated-explore` OpenSpec task/evidence files and feature commit `2fc65c1`.
- Per-feature tests/checks: focused Feeds/Explore/auth/access/UI suites, TypeScript, both strict OpenSpec validations, no-lint production build, code/security review, and real browser acceptance.
- Merge order used: current main was integrated into `codex/add-feeds-product`; that combined Feeds/Explore branch is then fast-forwarded into main with autostash preserving local user edits.
- Final verification: after current-main integration, 77 conflict-focused tests, 56 access/CSP tests, TypeScript, strict OpenSpec validations, and `next build --no-lint` passed; normal build remains blocked by pre-existing repository-wide ESLint debt.
- Remaining risks: Miniflux and local Supabase must remain available at runtime; the project-wide Next.js advisory and repository lint debt remain separate maintenance issues.

### Feature: diligence-output-language

#### OpenSpec Decision

- Required: yes
- Reason: this is a browser-visible, contract-changing feature across persistence, asynchronous jobs, AI prompts, and finalized investment artifacts.
- Change: `openspec/changes/add-diligence-output-language`
- Classification: `single-feature`, serial-required because the draft snapshot contract must land before pipeline and UI consumers

#### Acceptance

- A deal has one `en` / `zh-CN` diligence language, defaulted from the validated UI locale for interactive creation and from English for omitted/service creation.
- Every draft snapshots that language and every queued, resumed, or retried generation stage reads the snapshot rather than browser state.
- Natural-language artifacts follow the snapshot while structured keys, enums, IDs, citations, proper nouns, and verbatim evidence remain stable.
- A pre-generation change updates in place; a post-generation or finalized change creates a linked new draft version without modifying prior artifacts.
- One accessible deal-level selector controls the full workflow; stage pages do not repeat the choice.

#### Allowed Change Scope

- `supabase/migrations/`, `lib/types/database.ts`, diligence domain/API modules, memo-agent stages/jobs/prompts, expert-validation generation, diligence creation/detail UI, locale catalogs, focused tests, and browser evidence.
- Existing unrelated untracked evidence, demo deliverables, and scripts remain untouched.

#### Shared Contract Changes

- Adds constrained `output_language` data to deals and drafts plus nullable draft lineage.
- Adds one authorized language update/version endpoint and extends existing diligence DTOs with language metadata.
- Extends `buildSystemPrompt` with a required per-draft language contract without changing output JSON schemas.

#### Verification Plan

- Contract-first tests for language parsing, prompt directives, snapshot behavior, route validation, and version preservation.
- Focused stage/job integration tests, generated database types, TypeScript, changed-file lint, strict OpenSpec, and `git diff --check`.
- Authenticated browser verification for creation defaults, in-place selection, Chinese generation, and non-destructive post-generation switching.

#### Review Required

- Correctness review for stage coverage, retry determinism, and finalized immutability.
- Database/security review for constraints, authorization, concurrency, and cross-fund isolation.
- UX/accessibility review for concise labels, confirmation semantics, keyboard use, and responsive containment.

#### Progress / Evidence

- status: complete
- branch: `codex/diligence-output-language`
- planning: OpenSpec proposal, design, spec, and task plan created; strict validation passed before implementation
- verification: 1,447 tests, TypeScript, executable database contract, strict OpenSpec validation, and authenticated English/Chinese browser flows passed; production compilation succeeds before the repository-wide pre-existing lint gate
- workspace: unrelated pre-existing untracked screenshots, evidence, deliverables, and demo scripts are excluded from the feature scope

### Feature: user-timezone-preferences

#### OpenSpec Decision

- Required: yes
- Reason: this is a browser-visible change across SSR/client rendering, authenticated preferences, cookies, and database persistence.
- Change: `openspec/changes/add-user-timezone-preferences`
- Classification: `single-feature`, serial-required because the timezone resolver and persistence contract must land before provider and UI consumers

#### Acceptance

- Existing timestamps remain UTC instants in storage.
- The server and browser receive the same explicit IANA timezone for every hydrated render, eliminating timezone-driven date mismatches.
- A browser can detect its IANA timezone automatically without IP/GPS access and persist it as a device-local choice.
- A signed-in user can select Automatic or a manual IANA timezone; manual preference wins over automatic detection and survives across devices.
- Missing, invalid, or stale timezone values fall back safely to UTC.

#### Allowed Change Scope

- `openspec/changes/add-user-timezone-preferences/**`, this feature-plan entry, and focused HarnessKit progress/evidence.
- `i18n/**`, root provider/layout, timezone API/bootstrap, personal settings API/UI, locale catalogs, user profile/domain types, additive migration, and focused tests.
- Unrelated main-worktree navigation, landing-page, localization, diligence-preference, and image changes remain untouched.

#### Shared Contract Changes

- Adds nullable `user_profiles.time_zone`; `NULL` means automatic mode and a valid IANA value means manual override.
- Adds a bounded same-origin timezone-cookie endpoint and an explicit root i18n `timeZone` render input.
- Extends personal settings read/write payloads with timezone mode and manual value.

#### Verification Plan

- Unit tests for IANA validation, resolution precedence, invalid fallback, and automatic/manual bootstrap behavior.
- Route and migration tests for body/origin/host validation, cookie flags, authentication, and profile semantics.
- TypeScript, focused lint/tests, strict OpenSpec, HarnessKit fast/targeted, dependency audit review, and `git diff --check`.
- Real browser verification with a near-midnight UTC timestamp, `Asia/Shanghai` automatic mode, manual UTC override, reload persistence, and no hydration console error.

#### Review Required

- Correctness review for first-request behavior, single refresh, precedence, and render determinism.
- Security/database review for cookie boundaries, input validation, authorization, RLS preservation, and additive migration safety.
- Browser/UX review for automatic/manual controls, keyboard access, localization, and responsive settings layout.

#### Progress / Evidence

- status: in_progress
- branch/worktree: `codex/user-timezone-preferences` at `/home/ubuntu/workspace/reporting-timezone`
- planning: OpenSpec proposal, design, specification, and task plan are strict-valid
- implementation: resolver, secure host-only cookie synchronization, additive profile persistence, root request/client provider, manual Personal Settings override, and the complete hydrated client timestamp audit are implemented
- timestamp audit: all 218 `use client` modules are scanned; native date presentation is rejected except two explicitly classified browser-IANA detection calls, while calendar-only/business-period values retain explicit UTC semantics
- focused verification: timezone reconciliation passed 117 tests; the conservative full-client formatter inventory, explicit numeric `toLocaleString` classification, and exact LP Activity call sites are covered by `tests/time-zone-hydrated-formatters.test.ts`
- browser: Automatic Asia/Shanghai, manual UTC, reload persistence, reset, and sibling-tenant cookie isolation were observed; compact assertions and screenshots are under `.harnesskit/evidence/add-user-timezone-preferences/`
- open acceptance: 5.3 remains open because the app emits the unrelated existing `next-themes` root-class hydration warning and the captured screenshots do not cover every state; 5.4 remains open for repository baseline TypeScript/HarnessKit/build/audit gates
