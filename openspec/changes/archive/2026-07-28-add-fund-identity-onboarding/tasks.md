## 1. Planning and Contract Baseline

- [x] 1.1 Create the isolated feature worktree and record the Feature Requirement Contract, machine-readable feature state, and progress ledger.
- [x] 1.2 Capture external-login, global-profile, immutable Fund identity, exact invitation, immutable mailbox, scoped Settings, migration, and verification requirements in OpenSpec.
- [x] 1.3 Complete independent planner and security architecture reviews and incorporate direct-write, Host/Fund, token, owner-role, mailbox-retention, and legacy-domain findings.
- [x] 1.4 Write and self-review the task-by-task Superpowers implementation plan with exact files, interfaces, tests, commands, and commit boundaries.

## 2. Persistence and Security Contracts

- [x] 2.1 Add RED migration/security contract tests for global profiles, service-only invitations, direct Fund/member insert revocation, atomic bootstrap, unconditional identity immutability, claim-once mailboxes, and signup-hook internal-domain denial.
- [x] 2.2 Add a forward-only migration for `user_profiles`, conservative legacy display-name backfill, owner-only RLS/RPC access, timestamps, and service-role boundaries.
- [x] 2.3 Add service-only `fund_member_invitations` with normalized exact email, bounded roles, unique SHA-256 token hash, expiry/revocation/replacement/acceptance audit, constraints, indexes, and grants.
- [x] 2.4 Add service-only invitation create/rotate/revoke/resolve/accept functions with row locks, same verified Auth email, founder-only admin grants, one-Fund enforcement, Host-compatible Fund authority, replay safety, and no role upsert.
- [x] 2.5 Update the Supabase signup admission hook to allow live exact-email invitations while rejecting platform/tenant internal mailbox domains even through direct Auth API calls.
- [x] 2.6 Replace mutable mailbox upsert with idempotent same-value claim-once semantics, durable claimant/tombstone fields, display-name-only update, deactivation retention, and same-user restoration.
- [x] 2.7 Add the service-only atomic Fund bootstrap function that locks actor/slug and inserts equal new slug/email identity, founder admin membership, encrypted settings, and reserved mailboxes without optional provider/AI requirements.
- [x] 2.8 Revoke authenticated direct Fund and membership inserts, retire new domain-join mutations, and add unconditional post-creation slug/email-subdomain immutability while preserving existing values.
- [x] 2.9 Add disposable PostgreSQL tests for bootstrap rollback/concurrency/idempotency, invitation wrong-email/expiry/revocation/replay/concurrency/role/cross-Fund denial, mailbox races/retention, RLS, and legacy migration preservation.
- [x] 2.10 Regenerate and review typed database contracts without unrelated generated drift.

## 3. Domain Services and API Boundaries

- [x] 3.1 Add validated immutable profile DTOs/repository functions and unit tests for name normalization, ownership, external-email read-only behavior, and safe mailbox display-name propagation.
- [x] 3.2 Add Fund bootstrap validation/service functions and tests that reuse tenant slug normalization, produce encrypted inputs, map uniqueness errors safely, and build the canonical tenant origin.
- [x] 3.3 Refactor `/api/onboarding/fund` to the atomic bootstrap service, optionalize AI configuration, deny tenant-host/direct Fund selection, and make retries non-mutating.
- [x] 3.4 Add invitation token generation/hash/masking/link helpers and tests proving raw tokens never enter persistence, logs, DTOs, paths, or queries.
- [x] 3.5 Add administrator invitation list/create/revoke/resend APIs with trusted Fund access, founder-only admin invitation, platform email delivery, rate limits, validation, and secret-free responses.
- [x] 3.6 Add minimal public invitation resolve and authenticated accept APIs that derive Fund from token plus Host, require the same verified external email, and map invalid states uniformly.
- [x] 3.7 Add `/api/settings/personal` GET/PATCH for the current user's global profile and current Fund mailbox status/claim without accepting user or Fund ids.
- [x] 3.8 Narrow member list responses by access level and replace new join-request approval behavior with invitation status/actions while keeping legacy rows non-authoritative.
- [x] 3.9 Remove domain derivation from Fund creation, return controlled retired responses from domain-check/join mutations, and update route/access registries without a broad tenant bypass.

## 4. Onboarding and Invitation Experience

- [x] 4.1 Add RED component/route tests for Fund name plus slug preview/validation, optional integrations, conflict recovery, tenant creation denial, and successful canonical continuation.
- [x] 4.2 Refactor the Fund creation UI to select the immutable slug at creation, remove automatic domain discovery/join and mandatory Claude key, and explain host-only reauthentication.
- [x] 4.3 Add localized invitation page/auth handoff using URL fragments, `no-referrer`, same-tab session storage, controlled resolve states, exact-email guidance, and terminal token erasure.
- [x] 4.4 Add authenticated acceptance/confirmation behavior and first-entry links to Personal Settings mailbox claim and Current Fund setup.
- [x] 4.5 Add the authoritative resumable setup checklist for personal name, mailbox, Fund branding, Fund email connection, and members/invitations without client completion flags.

## 5. Scoped Settings and Member Administration

- [x] 5.1 Add RED settings access/UI/localization tests for distinct Personal and Current Fund navigation, the Personal application entry plus legacy Fund-root compatibility, read-only identities, member/admin visibility, and mobile behavior.
- [x] 5.2 Refactor the Settings layout into Personal and `Current Fund: <name>` groups while preserving existing nested Fund setting routes and deep links.
- [x] 5.3 Move profile, external login email, MFA/security, language/theme, and current Fund mailbox claim/status to `/settings/personal` backed only by the personal API.
- [x] 5.4 Keep the existing Fund settings root at `/settings`, remove personal writes from the Fund DTO, and display immutable tenant/email identities read-only.
- [x] 5.5 Replace member join-request controls with exact-email invitation creation, role selection, pending status, resend, revoke, accepted history, and administrator-only external email visibility.
- [x] 5.6 Remove editable Resend slug/domain identity controls while retaining existing inbound/outbound provider selection, encrypted keys, DNS status, webhook lifecycle, and secret-free DTOs.
- [x] 5.7 Complete English and Simplified Chinese messages and UI inventory coverage for all new routes, dialogs, status, errors, and responsive navigation.

## 6. Email and Compatibility Integration

- [x] 6.1 Update mailbox/domain services to consume creation-time immutable identity, claim-once user mailbox behavior, personal display names, active membership, and retained tombstones.
- [x] 6.2 Verify reserved `pitch`/`expert` mailboxes exist before provider setup and existing Resend configuration activates them without identity mutation.
- [x] 6.3 Preserve existing provider credentials, threads, messages, reply routes, webhook idempotency, inbound routing, outbound sending, and legacy differing slug/email identities.
- [x] 6.4 Update canonical invitation and setup links to use existing tenant-origin helpers and confirm platform mail never queries or falls back to Fund credentials.

## 7. Verification and Review

- [x] 7.1 Run focused profile, bootstrap, invitation, mailbox, settings, localization, access, Fund-subdomain, and Resend regression suites plus strict OpenSpec validation and HarnessKit fast.
- [x] 7.2 Run database migration/RLS/concurrency verification against a disposable stack and inspect grants, policies, triggers, functions, constraints, and legacy preservation.
- [x] 7.3 Run TypeScript, changed-scope ESLint, `git diff --check`, secret/marker scans, dependency audit comparison, full Vitest, and production build.
- [x] 7.4 Complete independent correctness, security, and accessibility reviews; fix and re-review every Critical/High/Important finding.
- [x] 7.5 Run real English/Chinese desktop and 390-pixel browser flows for external signup/login, Fund creation, tenant continuation, invitation/resend/revoke/accept, profile, mailbox claim, Settings scope, permissions, and existing Resend status.
- [x] 7.6 Record exact evidence in HarnessKit state/progress, mark every requirement/task with proof, commit the clean feature branch, and provide worktree/branch handoff without merging main.
