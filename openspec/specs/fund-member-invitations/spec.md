# fund-member-invitations Specification

## Purpose
TBD - created by archiving change add-fund-identity-onboarding. Update Purpose after archive.
## Requirements
### Requirement: Administrators invite one exact external email and bounded role
The system SHALL allow a current Fund administrator to create an invitation for one normalized exact external email and an allowlisted Fund role. The invitation SHALL bind the Fund, email, role, inviter, hashed high-entropy token, creation time, and expiry; raw tokens SHALL never be stored or logged.

#### Scenario: Administrator sends invitation
- **WHEN** an administrator submits a valid external email and `admin` or `member` role
- **THEN** the server persists an inert invitation, sends a canonical tenant invitation link through platform mail, activates the invitation only after successful delivery, and returns only secret-free status

#### Scenario: Invitation delivery fails
- **WHEN** the provider does not confirm successful invitation delivery
- **THEN** the invitation remains unusable for signup, resolution, acceptance, listing, and setup completion and the server revokes it when possible

#### Scenario: Non-founder administrator invites administrator
- **WHEN** an administrator who is not the Fund founder attempts to issue an `admin` invitation
- **THEN** the system rejects the role grant while still allowing an otherwise authorized `member` invitation

#### Scenario: Member attempts invitation
- **WHEN** a non-administrator attempts to create, revoke, or resend an invitation
- **THEN** the system denies the request without revealing invitation token material

#### Scenario: Role escalation input
- **WHEN** a caller submits an unrecognized, owner-equivalent, platform, or otherwise disallowed role
- **THEN** the system rejects the invitation before persistence or email delivery

### Requirement: Invitation links keep bearer material out of request URLs
The system SHALL place the raw invitation token in the URL fragment and SHALL resolve and accept it only through bounded same-origin POST bodies. The invite/auth pages SHALL use `Referrer-Policy: no-referrer`, may keep the token only in same-tab session storage across external-email authentication, and SHALL erase it after acceptance, rejection, or expiry. Resolution responses SHALL expose only the minimum Fund branding, masked invitee identity, role label, and expiry needed for confirmation.

#### Scenario: Recipient opens invitation
- **WHEN** the browser loads a canonical invitation link
- **THEN** the HTTP request URL contains no raw token and client code submits the fragment token to the resolver without durable or cross-tab persistence

### Requirement: Acceptance requires the same verified external email
The system SHALL accept an invitation only for an authenticated user whose verified normalized external email exactly equals the invitation email. Acceptance SHALL atomically lock and consume the live invitation and create the one permitted Fund membership with the invitation role.

#### Scenario: Matching verified user accepts
- **WHEN** the matching verified external-email account accepts an unexpired, unrevoked, unused invitation
- **THEN** one membership is created, the invitation records its acceptance and user, and a retry returns an idempotent completed outcome

#### Scenario: Different authenticated email
- **WHEN** an authenticated account with a different normalized email presents a valid invitation token
- **THEN** the system denies acceptance without consuming the invitation or revealing the full invited email

#### Scenario: Expired, revoked, or replayed token
- **WHEN** a token is expired, revoked, already replaced, or replayed after acceptance
- **THEN** the system creates no new membership and returns a controlled invalid-or-expired outcome

#### Scenario: Cross-Fund membership conflict
- **WHEN** invitation acceptance would violate the existing one-auth-user-to-one-Fund invariant
- **THEN** the transaction fails closed without consuming the invitation or altering either Fund

### Requirement: Resend and revocation rotate invitation authority
The system SHALL let a Fund administrator revoke a live invitation or resend it by replacing the token hash and expiry. Revocation or replacement SHALL invalidate all previously issued raw tokens immediately.

#### Scenario: Administrator resends invitation
- **WHEN** an administrator resends a pending invitation
- **THEN** a new token hash and expiry replace the previous authority and only the new link can be accepted

### Requirement: Email-domain joining is retired
The system SHALL stop discovering Funds, creating join requests, or approving new memberships from similarities between external email domains. Direct authenticated membership inserts SHALL be revoked. Legacy join-request rows SHALL remain non-authoritative history and legacy mutation endpoints SHALL fail closed after the migration window.

#### Scenario: Uninvited user enters onboarding
- **WHEN** an authenticated user without membership or invitation opens onboarding
- **THEN** the platform offers Fund creation where allowed or asks for an invitation and does not search by email domain
