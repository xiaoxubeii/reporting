# platform-personal-identity Specification

## Purpose
TBD - created by archiving change add-fund-identity-onboarding. Update Purpose after archive.
## Requirements
### Requirement: External email is the platform authentication identity
The system SHALL use the verified Supabase Auth external email as the only email identifier for registration, sign-in, invitation acceptance, verification, and account recovery. A Fund-derived internal mailbox SHALL NOT be accepted or copied into the authentication identity.

#### Scenario: User signs in with external email
- **WHEN** a user submits the verified external email and valid credential on the platform or matching tenant authentication page
- **THEN** the system authenticates the existing Supabase account and applies the existing Host-to-Fund session boundary

#### Scenario: User tries internal business address
- **WHEN** a user submits an address derived from a Fund mailbox as the authentication identifier
- **THEN** the system returns the same controlled invalid-credential outcome as an unknown identity and does not reveal mailbox ownership

#### Scenario: Existing user attempts an internal email change
- **WHEN** an existing external-email account attempts to change its Auth email or pending email-change value to the platform root or any Fund tenant mailbox domain
- **THEN** the database rejects the change before the internal address can become an authentication, recovery, or invitation identity

### Requirement: One global personal profile belongs to the auth user
The system SHALL persist one personal profile keyed by the auth user id for the person's real name, independently of Fund membership, role, and business mailbox. Profile reads SHALL be limited to the authenticated owner. Writes SHALL use the explicit server-owned profile transaction so an authenticated Data API call cannot bypass mailbox display-name synchronization.

#### Scenario: User saves real name
- **WHEN** an authenticated user saves a trimmed valid real name in Personal Settings
- **THEN** every Fund-independent profile read returns the new name and Fund authorization remains unchanged

#### Scenario: User has no migrated name
- **WHEN** a user has no global profile name
- **THEN** the system displays a controlled empty state or the external email as a fallback without inventing a name

### Requirement: Signup admission composes with Fund invitations
The system SHALL admit signup when the normalized external email is allowed by the existing platform allowlist or has a live exact-email Fund invitation. Signup admission SHALL NOT itself create Fund membership or consume the invitation, and SHALL reject the platform root domain and every FundWorkspace tenant subdomain as an external identity even if a wildcard allowlist entry would otherwise match.

#### Scenario: Invited new user registers
- **WHEN** a live invitation exists for an external email that is not otherwise allowlisted
- **THEN** the auth hook permits that exact email to register and still requires normal email verification and explicit invitation acceptance

#### Scenario: Domain-only similarity
- **WHEN** an uninvited email shares a domain with a Fund member or Fund metadata
- **THEN** that similarity grants neither signup admission nor Fund membership

#### Scenario: Internal mailbox registration attempt
- **WHEN** a caller attempts to register a `fundworkspace.com` or tenant-subdomain business mailbox directly through the application or Supabase Auth API
- **THEN** the auth admission hook rejects it without revealing whether the mailbox exists

### Requirement: Legacy member display names migrate without changing authority
The system SHALL migrate a usable existing member display name into the user's global profile only when the target profile name is empty, and SHALL preserve the legacy field during the compatibility window without using it as an authorization input.

#### Scenario: Existing member has a display name
- **WHEN** the migration encounters an existing user with one member display name and no global profile name
- **THEN** the global profile receives that display name and the user's Fund, role, and mailbox remain unchanged
