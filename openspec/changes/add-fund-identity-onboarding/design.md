## Context

FundWorkspace already has strong but separate tenant and mail foundations: `funds.slug` is the stable immutable Host identity; `funds.email_subdomain` was added later by the multi-tenant Resend implementation; Supabase Auth owns external login email; `fund_members.display_name` currently doubles as a user name; domain matching creates `fund_join_requests`; and the approximately 5,000-line Settings page mixes personal security/profile controls with Fund administration.

The completed Fund-subdomain change also enforces one auth account to one Fund across GP and LP graphs and host-only browser sessions. The completed Resend change already owns Fund credentials, reserved mailboxes, messages, reply routes, signed inbound events, and provider isolation. This change must compose with both rather than weaken Host/Fund equality, share cookies across sibling hosts, or create a second provider stack.

The primary stakeholders are a founder creating the first Fund, administrators inviting colleagues, members claiming a business address, existing Funds whose links/mail already work, and operators responsible for authentication and provider secrets.

## Goals / Non-Goals

**Goals:**

- Make verified external email the explicit platform login/recovery identity for every user and administrator.
- Store one global real-name profile independent of Fund membership.
- Reserve the new Fund's web and email identity at creation and make it immutable.
- Create the Fund, founder admin membership, settings/encryption, and reserved mailboxes atomically without requiring an AI or email provider.
- Replace email-domain joining with exact-email, expiring, single-use invitations.
- Turn the existing mutable mailbox upsert into a claim-once business identity that is retained after membership deactivation.
- Separate Personal from Current Fund Settings and provide a resumable founder checklist.
- Preserve existing Fund/Resend identities, mail, links, and current one-user-one-Fund isolation.

**Non-Goals:**

- Using internal Fund email as a login alias, recovery address, or Supabase Auth identity.
- Allowing one auth account to join multiple Funds in this change.
- Provisioning Resend accounts or DNS, replacing the current provider selectors, or building IMAP/POP mailboxes.
- Adding an `owner` database role across the existing authorization graph; the founder remains an `admin` and `funds.created_by` records founder ownership.
- Silently renaming an existing tenant hostname or verified mail domain to reconcile historical `slug` and `email_subdomain` differences.
- Sharing browser session cookies across Fund subdomains.

## Decisions

### 1. Supabase Auth email and global profile are separate authorities

`auth.users.email` remains the only authentication and invitation-matching email. A new `user_profiles` row keyed by `user_id` owns `full_name` and timestamps; later person-level preferences may extend this row without affecting tenancy. The Personal API reads the external email from the live Auth user and writes the profile through a least-privilege owner-scoped RPC or server path.

The current `fund_members.display_name` remains temporarily for compatibility. Migration copies a non-empty value into an empty global profile, and all new profile UI uses `user_profiles`. It is never an authorization input.

Alternatives rejected:

- Supabase `user_metadata`: convenient but too weak as the application source of truth and awkward to query safely for activity/member displays.
- Keeping the name on `fund_members`: conflates a person with one tenant relationship and leaves Personal Settings dependent on Fund membership.

### 2. New Funds reserve both identities atomically; existing identities are preserved

The creation form accepts a normalized DNS-safe slug and previews the configured root-domain address. A service-role-only `create_fund_with_owner` RPC locks the actor and slug, inserts the Fund with explicit `slug` and matching `email_subdomain`, relies on the existing creator trigger for the founder `admin` membership, inserts `fund_settings` with the server-produced encrypted Fund key envelope, and ensures `pitch`/`expert` mailboxes in one transaction.

New Funds therefore use one value for Host and email identity. Database triggers reject later changes to either column even without a provider connection. Existing Funds keep both current values; missing email subdomains are backfilled conflict-safely, but a pre-existing difference is recorded and displayed read-only rather than renamed. Email code continues using the persisted email subdomain for legacy delivery, while all new creation sets it equal to the canonical slug.

Alternatives rejected:

- Application-level insert plus compensating deletes: failures can expose half-created rows and cleanup can fail.
- Globally rewriting existing `slug` to `email_subdomain` or vice versa: breaks one already-published class of hostname/link/mail address and contradicts prior immutability.
- Waiting until Resend setup to choose mail identity: reintroduces the ambiguity the feature removes.

### 3. Founder ownership does not add a new role value

The founder has the existing `admin` role and remains identifiable by `funds.created_by`. Invitation roles are limited to `admin` and `member`; only the founder may issue an `admin` invitation, and invitation APIs can never transfer founder ownership. Direct authenticated Fund or membership insert policies/grants are revoked so callers cannot bypass the bootstrap or invitation transactions. This preserves the current access mapping and avoids treating an unknown new role as least privilege in some routes and administrator in others.

### 4. Invitations are service-owned bearer capabilities with exact identity proof

`fund_member_invitations` is service-only and records normalized email, bounded role, SHA-256 token hash, inviter, expiry, replacement/revocation, and acceptance audit fields. Creation uses 32 random bytes and sends via `sendPlatformEmail()`. The raw token appears only in the URL fragment so it is absent from HTTP access logs and Referer headers; the invite page submits it in a bounded same-origin POST body.

The invite and authentication pages use `no-referrer`; if authentication is required on the tenant host, the raw token is retained only in same-tab session storage and erased after terminal resolution. No broad tenant middleware bypass is added: only the exact public invite resolution surface and existing auth routes are admitted before membership, and acceptance still requires token Fund equals Host Fund.

The Supabase before-user-created hook admits an exact email when either the existing allowlist matches or a live invitation exists. This only permits account creation. Acceptance is a separate service-only transaction that locks the token row and verifies live status, exact verified Auth email, trusted Host Fund where configured, existing one-Fund constraint, and role before inserting membership and recording consumption.

Resend generates a new token/hash/expiry and invalidates the previous hash. Revocation is immediate. Resolver responses mask the invited address and return no ids or secret material not needed by the confirmation UI.

Alternatives rejected:

- Reusing `fund_join_requests`: those rows are user-created after domain discovery, lack pre-registration authority and bearer-token lifecycle, and encode the rejected approval model.
- Long-lived user/API tokens: unnecessary blast radius; the invitation grants exactly one bounded membership transition.
- Token in a path or query string: commonly logged and leaked through navigation/referrers.

### 5. Mailbox identity is claim-once and retained as a tombstone

The mailbox service remains the only writer. The current `fund_email_set_user_mailbox` RPC becomes idempotent for the same local part and rejects a different local part once claimed. A durable immutable claimant id/claimed timestamp separates historical ownership from the current active membership pointer. Membership removal/deactivation makes the mailbox inactive but does not cascade-delete the identity or release `(fund_id, local_part)`; an explicitly restored same-user membership may reactivate the same mailbox.

The local part policy stays centralized in SQL and shared TypeScript validation. The global personal name supplies the default safe sender display name; changing it updates future sender rendering without changing the address or historical messages.

Alternatives rejected:

- Keeping the existing upsert: violates the user-confirmed immutability contract.
- Deleting mailboxes with membership: permits address takeover and can misroute late replies.
- Storing the full address: duplicates the Fund domain and risks divergence; the server derives it.

### 6. Settings uses route-level scope separation

`/settings` redirects to `/settings/personal`. The Settings layout renders two navigation groups: Personal and `Current Fund: <name>`. `/settings/personal` contains global profile, external login email, MFA/security, current language/theme controls, and current Fund mailbox claim/status. `/settings/fund` contains the existing Fund settings, with nested existing appearance, public site, email routing, members/invitations, AI, and integration routes grouped beneath it.

Personal reads/writes use a new `/api/settings/personal` contract and require only the authenticated owner. Fund APIs retain live membership/domain access checks; administrator-only controls remain denied to members. The old mixed `/api/settings` response is narrowed over a compatibility period rather than making Personal writes pass through an admin-oriented Fund DTO.

Alternatives rejected:

- Two cards on the same 5,000-line page: visually and technically preserves the mixed authority boundary.
- One query-parameter tab: leaves every field and permission in one route/component and makes deep links ambiguous.

### 7. Setup progress is derived, not a client-managed state machine

The founder setup page computes steps from authoritative records: non-empty personal name, claimed mailbox, Fund branding, sending/receiving provider state, and members/pending invitations. Optional provider/AI steps never gate login. A small persisted dismissal/skip record is needed only if product copy offers an explicit skip; completion itself is never trusted from the client.

On hosted production, platform and tenant browser cookies are host-only by design. After creation the platform shows the canonical tenant link; entering the new tenant may require the founder to sign in again with the same external email. This is an intentional isolation cost and no cross-subdomain session handoff is introduced.

### 8. APIs derive Fund authority and never accept an arbitrary Fund id

Creation is platform/pre-membership only. Personal routes use the live Auth user. Fund invitation/list/revoke, mailbox, and settings routes derive the Fund from the trusted Host/session membership access helper. Public invitation resolution derives the target Fund from the hashed token and, in hosted mode, also requires the Host to match before disclosing bounded branding. Service-role database calls include Fund fences and do not turn client ids into authority.

## Risks / Trade-offs

- **[Existing slug and email subdomain differ]** → Preserve both, prohibit further changes, surface the legacy state read-only, and keep existing email routing on the current email subdomain.
- **[Invitation permits signup but is revoked before acceptance]** → Signup remains only a platform account; acceptance rechecks the locked live invitation and creates no membership.
- **[Email case/Unicode ambiguity]** → Normalize with one server/SQL policy before hashing, uniqueness, auth-hook admission, and equality; reject unsupported ambiguous forms rather than performing inconsistent transforms.
- **[Token replay or concurrent acceptance]** → Hash unique tokens, lock the invitation row, record acceptance atomically, and make completed retries idempotent only for the same user.
- **[Founder transaction requires application encryption]** → Produce ciphertext in the server before the RPC and pass only encrypted values; the service-role RPC grants execute only to service role and validates all structural inputs.
- **[Membership deletion currently cascades mailbox]** → Migrate mailbox ownership to a durable claimant field and deactivate before removing active membership linkage; test late inbound/outbound denial and no local-part reuse.
- **[Large Settings refactor regresses existing integrations]** → Move scopes incrementally, keep provider components/APIs unchanged where possible, and run focused plus full UI/provider regression suites.
- **[Cross-host reauthentication surprises founders]** → Show a clear success/continue screen explaining that the same external account signs into the new tenant; do not weaken cookie isolation.
- **[Direct Data API bypass]** → Revoke authenticated Fund/membership inserts and grant creation/acceptance RPCs only to service role; route handlers re-derive actor and Fund authority.
- **[Existing dependency advisories]** → Run changed-scope security review and record the repository-wide dependency audit separately; this change adds no new runtime dependency.

## Migration Plan

1. Run preflight SQL assertions for duplicate/invalid profile, invitation, Fund identity, and mailbox states; preserve existing slug and configured email subdomain values.
2. Create `user_profiles`, owner-only policies/RPCs, and conservative display-name backfill.
3. Create service-only invitation persistence, token lifecycle functions, exact-email signup-hook admission, and atomic acceptance.
4. Add immutable mailbox claimant/audit fields, replace mutable upsert semantics, deactivate orphaned mailboxes without freeing local parts, and retain all message/thread references.
5. Add the service-only atomic Fund bootstrap RPC and unconditional identity immutability guards; new Funds write equal slug/email subdomain values.
6. Deploy generated database types and domain services, then APIs, then Personal/Fund Settings and onboarding/invitation UI.
7. Disable new domain-based join discovery and mutations after invitation UI is active; keep legacy rows as non-authoritative history during the compatibility window.
8. Verify existing Funds and Resend connections before enabling the new creation flow. Rollback application code may read the additive schema, but the forward-only identity/token/mailbox invariants are not rolled back or loosened.

## Open Questions

- Production deletion/recovery policy should keep Fund slugs and mailbox local parts reserved indefinitely; permanent transfer or reuse requires a separate audited platform-admin process and is outside this change.
