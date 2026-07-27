# Fund Identity and Onboarding Design

The approved design separates the verified external Supabase Auth email from Fund business identity, creates one global personal profile, reserves the immutable Fund web/email identity during an atomic founder bootstrap, replaces email-domain joining with exact-email single-use invitations, makes member mailbox local parts claim-once and retained, splits Personal from Current Fund Settings, and reuses the existing multi-tenant Resend stack.

The normative source of truth is the validated OpenSpec change:

- [`proposal.md`](../../../openspec/changes/add-fund-identity-onboarding/proposal.md)
- [`design.md`](../../../openspec/changes/add-fund-identity-onboarding/design.md)
- [`specs/`](../../../openspec/changes/add-fund-identity-onboarding/specs/)
- [`tasks.md`](../../../openspec/changes/add-fund-identity-onboarding/tasks.md)

Key hard boundaries are: internal Fund addresses never authenticate; new Fund `slug` and `email_subdomain` are equal at creation and immutable; existing published identities are never silently renamed; Fund/member direct Data API inserts are revoked; founder remains the existing `admin` role and is identified by `funds.created_by`; invitation tokens are random, hash-only, expiring, role/Fund/email bound, and single-use; mailbox local parts cannot be changed or released after claim; and no second email provider/credential stack is introduced.
