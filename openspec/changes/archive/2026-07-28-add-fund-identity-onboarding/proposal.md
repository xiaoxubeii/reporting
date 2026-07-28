## Why

FundWorkspace currently mixes a user's platform login identity, Fund membership display name, Fund creation metadata, email-domain-based joining, and Fund email configuration. This makes first-Fund setup ambiguous and permits external email domains to influence tenant membership, while the immutable Fund business domain is chosen too late in email settings.

## What Changes

- Keep the verified external Supabase Auth email as the only registration, login, verification, invitation-acceptance, and recovery identity for users and administrators.
- Add one global personal profile per auth user for real name and person-level preferences instead of treating `fund_members.display_name` as the global identity.
- Change Fund creation to validate and atomically reserve an immutable unique Fund slug, create the founder as owner, initialize required settings, and reserve built-in business mailboxes.
- **BREAKING** Remove automatic Fund discovery/joining based on the external login email domain and replace it with exact-email, role-bound, expiring, single-use administrator invitations.
- Let each active Fund member claim one server-derived internal business mailbox local part once; the resulting `<local-part>@<fund-slug>.fundworkspace.com` address is immutable and never functions as a login credential.
- Split Settings into Personal and Current Fund scopes, with explicit authority, current-Fund context, immutable domain display, and a resumable founder setup checklist.
- Reuse the existing platform/Fund Resend provider, inbound/outbound routing, reserved mailbox, reply-route, and secret-isolation implementation rather than adding a second email configuration stack.
- Migrate existing Funds, members, display names, join requests, and mailboxes forward without automatically releasing or reassigning existing tenant or mailbox identities.

## Capabilities

### New Capabilities

- `platform-personal-identity`: External-email authentication and one global personal profile independent of Fund membership.
- `fund-creation-onboarding`: Immutable Fund identity reservation, atomic owner bootstrap, and resumable first-Fund setup.
- `fund-member-invitations`: Exact-email, role-bound, expiring, single-use invitations that replace email-domain joining.
- `fund-business-identity`: Immutable per-membership business mailbox identities integrated with existing Fund email routing.
- `scoped-settings`: Separate Personal and Current Fund settings surfaces with explicit authorization and tenant context.

### Modified Capabilities

<!-- No root OpenSpec capability currently exists; this change composes with the completed Fund subdomain and multi-tenant Resend change contracts without reopening their artifacts. -->

## Impact

- Database: forward-only migrations for personal profiles, Fund identity/bootstrap invariants, invitations, mailbox immutability, RLS/RPCs, audit fields, and legacy data transition.
- APIs: Fund onboarding, signup admission, invitation creation/acceptance/revocation, personal profile, Fund settings, membership administration, mailbox claim, and setup progress.
- UI: platform and tenant onboarding, Settings navigation/pages, member administration, mailbox identity, setup checklist, and English/Simplified Chinese copy.
- Email: existing Resend connection and routing services consume the creation-time immutable Fund identity and invitation/member mailbox contracts.
- Security: external-email proof, token hashing/expiry/replay prevention, role escalation denial, Host/Fund authority, cross-Fund isolation, mailbox spoofing denial, and secret non-disclosure.
