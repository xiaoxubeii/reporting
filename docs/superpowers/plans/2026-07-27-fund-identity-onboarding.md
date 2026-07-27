# Fund Identity and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate external platform authentication from immutable per-Fund business identity and deliver atomic Fund creation, exact-email invitations, claim-once internal mailboxes, and clearly scoped Personal/Fund Settings over the existing tenant and Resend architecture.

**Architecture:** A forward-only Supabase migration establishes the security invariants and service-only transactions first. Focused TypeScript services expose secret-free DTOs and route handlers derive actor/Fund authority from live Auth/Host context. Browser surfaces then consume those contracts while existing Fund-subdomain and Resend paths remain unchanged for legacy identities.

**Tech Stack:** Next.js 14 App Router, TypeScript, React, Supabase Auth/PostgreSQL/RLS, Vitest/Testing Library, next-intl, existing FundWorkspace tenant and Resend services.

## Global Constraints

- Verified external Supabase Auth email is the only registration, login, verification, invitation-matching, and recovery email; internal Fund mailboxes never authenticate.
- New Funds persist the same normalized value in `funds.slug` and `funds.email_subdomain`; both are immutable after creation.
- Existing differing tenant/email identities are preserved read-only and never silently renamed.
- Founder remains role `admin`; `funds.created_by` identifies founder ownership; only the founder may invite another administrator.
- Fund and membership inserts are not directly available through authenticated Data API policies; bootstrap and invitation acceptance are service-only transactions.
- Invitation raw tokens are at least 32 random bytes, stored only as SHA-256 hashes, absent from paths/queries/logs/DTOs, and are Fund/email/role/expiry/single-use bound.
- A claimed mailbox local part is immutable and never released for another user; display name may change independently.
- Current one-auth-account-to-one-Fund and Host-only session isolation remain unchanged.
- Existing Resend credentials, AAD encryption, provider selectors, webhook lifecycle, reserved mailboxes, threads/messages/reply routes, and routing are reused.
- Every new user-visible string is complete in English and Simplified Chinese; new Settings/onboarding/invite UI works at 390 CSS pixels without horizontal overflow.
- No new runtime dependency and no hardcoded secret.

---

### Task 1: Persistence and Database Security Boundary

**Files:**
- Create: `tests/fund-identity-onboarding-migration-security.test.ts`
- Create: `supabase/migrations/20260729000000_fund_identity_onboarding.sql`
- Create: `supabase/tests/fund_identity_onboarding.sql`
- Modify: `lib/types/database.ts`
- Modify: `supabase/migrations/20260306120000_before_user_created_hook.sql` only through the new forward migration's replacement function

**Interfaces:**
- Produces: `user_profiles`, `fund_member_invitations`, `bootstrap_fund_identity(...)`, invitation lifecycle RPCs, claim-once mailbox RPCs, and direct-write revocations.
- Consumes: `funds.slug`, `funds.email_subdomain`, `fund_members`, `fund_settings`, `fund_email_mailboxes`, `fund_email_ensure_reserved_mailboxes`, and existing one-Fund triggers.

- [ ] **Step 1: Write RED migration contract tests**

Add source-contract assertions that require all critical objects and denial clauses before the migration exists:

```ts
expect(sql).toContain('create table public.user_profiles')
expect(sql).toContain('create table public.fund_member_invitations')
expect(sql).toContain('revoke insert on table public.funds from authenticated')
expect(sql).toContain('revoke insert on table public.fund_members from authenticated')
expect(sql).toContain('create or replace function public.bootstrap_fund_identity')
expect(sql).toContain('create or replace function public.accept_fund_member_invitation')
expect(sql).toContain('Fund mailbox local part is immutable')
expect(sql).toContain('Internal Fund email cannot authenticate')
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/fund-identity-onboarding-migration-security.test.ts`

Expected: FAIL because `20260729000000_fund_identity_onboarding.sql` does not exist.

- [ ] **Step 3: Implement the forward-only schema and functions**

Create these exact core shapes, with complete checks/indexes/grants in the migration:

```sql
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or (char_length(full_name) between 1 and 120 and full_name !~ E'[\\r\\n]')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fund_member_invitations (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id) on delete cascade,
  email_normalized text not null,
  role text not null check (role in ('admin', 'member')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (accepted_at is not null and revoked_at is not null))
);
```

The bootstrap RPC must insert Fund, settings, and reserved mailboxes in one transaction and return only `(fund_id, slug)`. The invitation accept RPC locks the matching hash row, compares verified `auth.users.email`, uses the row's Fund/role, inserts membership without upsert, and then records acceptance. Replace mailbox upsert so an existing same local part is idempotent and a different local part raises SQLSTATE `23505`/controlled conflict. Add durable `claimed_by_user_id`/`claimed_at`, deactivate rather than free on membership deletion, and retain the local-part unique index.

Recreate the before-user-created hook so allowlist OR live exact invitation admits external email, but exact `fundworkspace.com` and `%.fundworkspace.com` are denied first. Revoke authenticated direct inserts on `funds` and `fund_members` and remove/replace permissive insert policies.

- [ ] **Step 4: Add real database behavior tests**

Cover atomic rollback, two-actor same-slug race, same-actor retry non-mutation, direct Data API denial, invitation wrong/unverified email, expiry, revocation, replay, role escalation, one-Fund conflict, concurrent accept, mailbox same-user/different-user races, rename denial, deletion retention, and existing differing identity preservation.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npx vitest run tests/fund-identity-onboarding-migration-security.test.ts tests/resend-email-migration-security.test.ts tests/fund-subdomain-migration-security.test.ts
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fund_identity_onboarding.sql
```

Expected: all focused source contracts and disposable SQL assertions pass.

- [ ] **Step 6: Update generated database types and refactor SQL duplication**

Add exact Row/Insert/Update/RPC types for the new tables/functions, keep service-only tables out of client DTOs, and rerun the focused tests.

- [ ] **Step 7: Commit**

```bash
git add tests/fund-identity-onboarding-migration-security.test.ts supabase/migrations/20260729000000_fund_identity_onboarding.sql supabase/tests/fund_identity_onboarding.sql lib/types/database.ts
git commit -m "feat: add fund identity persistence contracts"
```

### Task 2: Personal Profile Service and API

**Files:**
- Create: `lib/identity/personal-profile.ts`
- Create: `lib/identity/personal-profile.test.ts`
- Create: `app/api/settings/personal/route.ts`
- Create: `tests/personal-settings-route.test.ts`
- Modify: `lib/access/route-domains.ts`
- Modify: `app/api/settings/route.ts`

**Interfaces:**
- Produces: `normalizeFullName(value): string | null`, `loadPersonalSettings(user)`, `updatePersonalProfile(userId, input)`, `PersonalSettingsDto`.
- Consumes: live Supabase Auth user, `user_profiles`, current membership, and existing mailbox service.

- [ ] **Step 1: Write RED unit and route tests**

Define the wished-for DTO and denial behavior:

```ts
type PersonalSettingsDto = {
  externalEmail: string
  fullName: string
  mailbox: { localPart: string; address: string; active: boolean } | null
  fund: { name: string; slug: string; emailSubdomain: string } | null
}
```

Tests must prove omitted `userId`/`fundId` inputs, owner-only profile writes, 120-character/header validation, external email read-only, normal-member access, and no Fund setting/provider secret in the response.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run lib/identity/personal-profile.test.ts tests/personal-settings-route.test.ts`

Expected: FAIL because the module and route do not exist.

- [ ] **Step 3: Implement minimal profile service and API**

Use immutable DTO construction and server-derived identity:

```ts
export function normalizeFullName(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new PersonalProfileError('invalid_name', 400)
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > 120 || /[\r\n]/.test(normalized)) {
    throw new PersonalProfileError('invalid_name', 400)
  }
  return normalized
}
```

PATCH accepts only `{ fullName }`; GET derives Auth email/user id and optional current membership. Remove `displayName` personal mutation from `/api/settings`, but retain a compatibility response only until callers move.

- [ ] **Step 4: Verify GREEN and regressions**

Run: `npx vitest run lib/identity/personal-profile.test.ts tests/personal-settings-route.test.ts tests/settings-access-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/identity app/api/settings/personal tests/personal-settings-route.test.ts lib/access/route-domains.ts app/api/settings/route.ts
git commit -m "feat: add personal profile settings API"
```

### Task 3: Atomic Fund Bootstrap and Creation UI

**Files:**
- Create: `lib/onboarding/fund-bootstrap.ts`
- Create: `lib/onboarding/fund-bootstrap.test.ts`
- Modify: `app/api/onboarding/fund/route.ts`
- Modify: `app/onboarding/page.tsx`
- Modify: `tests/onboarding-tenant-scope.test.tsx`
- Create: `tests/fund-onboarding-route.test.ts`
- Modify: `messages/en.json`
- Modify: `messages/zh-CN.json`

**Interfaces:**
- Produces: `validateFundCreationInput`, `bootstrapFundForUser`, response `{ fundId, slug, tenantOrigin, requiresTenantSignIn }`.
- Consumes: `normalizeFundSlugCandidate`, `isValidFundSlug`, `canonicalFundOrigin`, encryption helpers, and `bootstrap_fund_identity` RPC.

- [ ] **Step 1: Write RED validation/API/UI tests**

Tests require `{ fundName, fundSlug }`, optional `claudeApiKey`, reserved/duplicate conflict mapping, platform/pre-membership restriction, no `email_domain`, no application compensating delete, no existing-Fund mutation on retry, and localized immutable-domain confirmation.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run lib/onboarding/fund-bootstrap.test.ts tests/fund-onboarding-route.test.ts tests/onboarding-tenant-scope.test.tsx`

Expected: FAIL on missing bootstrap contract and old mandatory Claude/domain-join behavior.

- [ ] **Step 3: Implement service and API**

The route derives the user and trusted Host context, encrypts the Fund DEK/optional AI key before calling the service-only RPC, and maps SQL conflict to 409 without returning database details:

```ts
const input = validateFundCreationInput(await req.json())
const result = await bootstrapFundForUser({
  actorUserId: user.id,
  name: input.fundName,
  slug: input.fundSlug,
  claudeApiKey: input.claudeApiKey,
})
return NextResponse.json(result, { status: result.created ? 201 : 200 })
```

- [ ] **Step 4: Refactor onboarding UI**

Remove `check-domain`, join mode, email-domain explanations, mandatory Claude credential, and “create instead” branching. Add name, editable slug suggestion, live syntax/availability feedback, immutable confirmation, canonical preview, conflict retry, and hosted-mode “continue and sign in to your Fund workspace” copy.

- [ ] **Step 5: Verify GREEN**

Run the Task 3 focused suite plus `tests/auth-fund-host.test.ts` and `tests/auth-post-login-destination.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/onboarding app/api/onboarding/fund app/onboarding tests/fund-onboarding-route.test.ts tests/onboarding-tenant-scope.test.tsx messages/en.json messages/zh-CN.json
git commit -m "feat: create funds with immutable identity"
```

### Task 4: Exact-Email Member Invitations

**Files:**
- Create: `lib/members/fund-invitations.ts`
- Create: `lib/members/fund-invitations.test.ts`
- Create: `app/api/settings/members/invitations/route.ts`
- Create: `app/api/settings/members/invitations/[id]/route.ts`
- Create: `app/api/public/fund-invitations/resolve/route.ts`
- Create: `app/api/fund-invitations/accept/route.ts`
- Create: `tests/fund-invitation-routes.test.ts`
- Modify: `app/api/auth/signup/route.ts`
- Modify: `lib/access/route-domains.ts`

**Interfaces:**
- Produces: `createInvitation`, `resendInvitation`, `revokeInvitation`, `resolveInvitation`, `acceptInvitation`, secret-free DTOs.
- Consumes: platform mail, canonical tenant origin, Auth verified email, service-only invitation RPCs.

- [ ] **Step 1: Write RED token/domain/route tests**

Use dependency injection for persistence/mail and assert the raw token only reaches the outbound fragment link:

```ts
expect(saved.tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'))
expect(saved).not.toHaveProperty('token')
expect(sent.href).toMatch(/^https:\/\/cci\.fundworkspace\.com\/invite#token=/)
expect(JSON.stringify(response)).not.toContain(rawToken)
```

Cover non-admin, non-founder admin-role grant, internal email, existing member, forged Fund/role, rate limit, send failure, resend rotation, revoke, Host mismatch, wrong/unverified email, expiry, replay, concurrency, and uniform invalid resolution.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run lib/members/fund-invitations.test.ts tests/fund-invitation-routes.test.ts`

Expected: FAIL because invitation services/routes do not exist.

- [ ] **Step 3: Implement invitation domain service**

Generate `randomBytes(32).toString('base64url')`, hash with SHA-256, normalize exact external email, derive Fund/actor from access context, and send through `sendPlatformEmail`. Never log request bodies or raw token; DTOs include masked email, role, expiry, timestamps, and status only.

- [ ] **Step 4: Implement admin/public/authenticated routes and access registry**

List/create are current-Fund admin-only; only `created_by` may issue role `admin`. Resolve is POST and secret-minimal. Accept uses live `getUser()`, requires verified matching email, and passes only token hash plus actor to the transactional RPC. Update signup API copy/admission without consuming membership.

- [ ] **Step 5: Retire domain join behavior**

Return a controlled 410 from new `check-domain`/`join` mutations, stop exposing pending join-request approvals as active membership actions, and preserve historical rows.

- [ ] **Step 6: Verify GREEN**

Run Task 4 tests plus `tests/settings-members-miniflux-provisioning.test.ts`, `tests/middleware-access-gate.test.ts`, and signup/auth tests.

- [ ] **Step 7: Commit**

```bash
git add lib/members app/api/settings/members app/api/public/fund-invitations app/api/fund-invitations app/api/auth/signup app/api/onboarding/check-domain app/api/onboarding/join lib/access/route-domains.ts tests/fund-invitation-routes.test.ts
git commit -m "feat: add exact-email fund invitations"
```

### Task 5: Immutable Member Mailbox and Personal Settings UI

**Files:**
- Modify: `lib/email/mailboxes.ts`
- Modify: `lib/email/mailboxes.test.ts`
- Modify: `app/api/settings/fund-email/route.ts`
- Create: `app/(app)/settings/personal/page.tsx`
- Create: `components/settings/personal-settings.tsx`
- Create: `tests/personal-settings-ui.test.tsx`
- Modify: `components/settings/fund-email-settings.tsx`

**Interfaces:**
- Produces: `claimUserMailbox({ fundId, userId, localPart, displayName })` with create/idempotent/conflict semantics.
- Consumes: Personal Settings API, global profile name, existing mailbox/domain formatting and safe header validation.

- [ ] **Step 1: Write RED mailbox/service/UI tests**

Require first claim, same-value idempotency, different-value 409, reserved/invalid denial, current membership, retained inactive tombstone, updated display name without local-part change, external email read-only, and normal-member personal access.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run lib/email/mailboxes.test.ts tests/personal-settings-ui.test.tsx`

Expected: FAIL because the existing mailbox function permits updates and Personal Settings page does not exist.

- [ ] **Step 3: Implement claim-once service and route contract**

Rename mutation semantics to claim and map RPC uniqueness/immutability outcomes to `FundEmailError('mailbox_conflict', ..., 409)`. Remove `configure_identity` from user-facing Fund email route; domain is status-only.

- [ ] **Step 4: Implement Personal Settings**

Render global name, external login email, existing MFA/security controls, language/theme controls, and a current Fund business-email card. Before claim, show a suggested editable local part and explicit irreversible confirmation; after claim, render the full address read-only and allow only name changes.

- [ ] **Step 5: Verify GREEN**

Run focused mailbox/personal UI/API tests plus all `lib/email/*mailbox*` and outbound sender tests.

- [ ] **Step 6: Commit**

```bash
git add lib/email/mailboxes.ts lib/email/mailboxes.test.ts app/api/settings/fund-email app/'(app)'/settings/personal components/settings tests/personal-settings-ui.test.tsx
git commit -m "feat: add immutable member business mailboxes"
```

### Task 6: Scoped Settings, Invitations UI, and Setup Checklist

**Files:**
- Modify: `app/(app)/settings/layout.tsx`
- Modify: `app/(app)/settings/page.tsx`
- Create: `app/(app)/settings/setup/page.tsx`
- Create: `components/settings/fund-setup-checklist.tsx`
- Create: `components/settings/member-invitations.tsx`
- Modify: `components/app-sidebar.tsx`
- Create: `tests/settings-scope-ui.test.tsx`
- Create: `tests/fund-setup-checklist.test.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-CN.json`
- Modify: `i18n/ui-surface-inventory.ts`

**Interfaces:**
- Produces: route-level Settings navigation and derived `FundSetupStatus`.
- Consumes: Personal API, existing Fund settings/members/email APIs, invitation APIs, current Fund descriptor.

- [ ] **Step 1: Write RED scope/access/localization tests**

Assert two labelled navigation groups, Personal app entry, legacy `/settings` Fund root, explicit current Fund, no Profile/MFA in Fund page, immutable slug/domain, admin-only external emails/invitations, secret-free provider fields, complete locale keys, and mobile-safe classes/semantics.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/settings-scope-ui.test.tsx tests/fund-setup-checklist.test.tsx tests/ui-localization.test.ts`

Expected: FAIL on mixed Settings and missing new UI.

- [ ] **Step 3: Refactor Settings layout and Fund root**

Keep `/settings` as the existing Fund page for deep links, remove Profile/MFA/person writes from it, show read-only tenant and email identities, and group all existing nested routes under `Current Fund: <name>`. Change the application Settings link to `/settings/personal`.

- [ ] **Step 4: Implement member invitation management**

Add exact external email, bounded role, send, pending/accepted/expired status, resend, revoke, accessible confirmation, and role-aware external-email visibility. Remove active join-request approval controls.

- [ ] **Step 5: Implement derived setup checklist**

Compute steps from profile, mailbox, branding, provider status, and membership/invitation responses; link each step to Personal or Fund destination and never accept client completion booleans.

- [ ] **Step 6: Complete localization and responsive behavior**

Add every English/Chinese key and verify 390px layout without horizontal overflow or icon-only unlabeled actions.

- [ ] **Step 7: Verify GREEN**

Run focused Settings/UI/localization tests and existing Fund email/public-site/appearance settings regressions.

- [ ] **Step 8: Commit**

```bash
git add app/'(app)'/settings components/settings components/app-sidebar.tsx tests/settings-scope-ui.test.tsx tests/fund-setup-checklist.test.tsx messages/en.json messages/zh-CN.json i18n/ui-surface-inventory.ts
git commit -m "feat: separate personal and fund settings"
```

### Task 7: Invitation Browser Handoff and Email Compatibility

**Files:**
- Create: `app/invite/layout.tsx`
- Create: `app/invite/page.tsx`
- Create: `components/invitations/fund-invitation.tsx`
- Create: `tests/fund-invitation-ui.test.tsx`
- Modify: `middleware.ts`
- Modify: `lib/tenancy/route-authority.ts`
- Modify: `lib/email/fund-credentials.ts`
- Modify: `lib/email/fund-outbound.ts`
- Modify: focused existing Resend/Fund-host tests only where new invariants require new expectations

**Interfaces:**
- Produces: fragment-token invitation/auth handoff and compatibility adapters.
- Consumes: resolve/accept APIs, same-tab session storage key, existing tenant branding/auth routes, Resend status/routing.

- [ ] **Step 1: Write RED browser component and route-admission tests**

Require no token in path/query, `no-referrer`, same-tab storage only while authenticating, exact tenant Host, terminal erasure, controlled invalid states, external-email login copy, and no broad middleware bypass.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/fund-invitation-ui.test.tsx tests/middleware-fund-host.test.ts tests/auth-fund-host.test.ts`

Expected: FAIL on missing invite surface.

- [ ] **Step 3: Implement invitation UI and narrow route authority**

Read `location.hash` client-side, immediately remove it from visible history, keep it in `sessionStorage` only until same-host signup/login/accept completes, resolve by POST, and erase on all terminal outcomes. Admit only exact invite/auth public paths before membership and still require token Fund equals Host Fund.

- [ ] **Step 4: Verify existing Resend compatibility**

Ensure Fund email configuration no longer mutates identity; legacy differing email subdomains still drive domain/address generation; new Funds use equal values; inactive user mailboxes cannot send/receive; reserved and reply routes remain unchanged.

- [ ] **Step 5: Verify GREEN and regressions**

Run invitation UI/Host tests plus all Resend domain/credentials/mailbox/inbound/outbound/webhook/reply-route suites.

- [ ] **Step 6: Commit**

```bash
git add app/invite components/invitations tests/fund-invitation-ui.test.tsx middleware.ts lib/tenancy/route-authority.ts lib/email
git commit -m "feat: complete tenant invitation handoff"
```

### Task 8: Full Verification, Reviews, and Browser Acceptance

**Files:**
- Modify: `openspec/changes/add-fund-identity-onboarding/tasks.md`
- Modify: `.harnesskit/state/feature_list.json`
- Modify: `.harnesskit/state/progress.md`
- Create: `.harnesskit/evidence/add-fund-identity-onboarding/verification.md`
- Create: browser screenshots only under `.harnesskit/evidence/add-fund-identity-onboarding/`

**Interfaces:**
- Consumes: every acceptance requirement and all implementation commits.
- Produces: requirement-by-requirement evidence and clean branch handoff.

- [ ] **Step 1: Run smoke and targeted verification**

```bash
openspec validate add-fund-identity-onboarding --strict
npx vitest run tests/fund-identity-onboarding-migration-security.test.ts lib/identity lib/onboarding lib/members tests/personal-settings-route.test.ts tests/fund-onboarding-route.test.ts tests/fund-invitation-routes.test.ts tests/personal-settings-ui.test.tsx tests/settings-scope-ui.test.tsx tests/fund-setup-checklist.test.tsx tests/fund-invitation-ui.test.tsx
npx tsc --noEmit
git diff --check
```

- [ ] **Step 2: Run security and compatibility suites**

Run disposable database tests, Fund host/auth/access tests, signup tests, member tests, all `lib/email` tests, migration security tests, and secret scans. Compare `npm audit --json` against the 24-advisory baseline and prove no new dependency/advisory was added.

- [ ] **Step 3: Run full verification**

```bash
npm test
npx next build --no-lint
```

Also run changed-scope ESLint and HarnessKit fast/targeted/full, recording any repository-wide pre-existing blocker separately from changed-scope evidence.

- [ ] **Step 4: Complete independent task and whole-branch review**

Run correctness, TypeScript, security, database, and accessibility review packages. Fix every Critical/High/Important finding, rerun covering tests, and obtain clean re-review.

- [ ] **Step 5: Run real browser acceptance**

Use disposable external emails and two tenant identities to verify English/Chinese desktop and 390px flows: external signup/login, Fund name/slug creation, canonical tenant continuation, invite create/resend/revoke/accept, wrong-email denial, profile save, mailbox claim/rename denial, Personal/Fund Settings separation, member/admin visibility, provider status, reload persistence, and no horizontal overflow/console/page/request failures. Delete disposable fixtures.

- [ ] **Step 6: Audit every requirement and update durable evidence**

Map every OpenSpec scenario to a test, database assertion, route response, or browser observation. Mark task checkboxes only after proof, update HarnessKit state/progress, and commit:

```bash
git add openspec/changes/add-fund-identity-onboarding .harnesskit/state .harnesskit/evidence/add-fund-identity-onboarding
git commit -m "test: verify fund identity onboarding"
```

- [ ] **Step 7: Final clean-tree handoff**

Confirm `git status --short` is empty, branch has commits beyond base `ed77fdc`, and provide the exact worktree, branch, commit list, verification results, remaining environment gates, and no-merge handoff.
