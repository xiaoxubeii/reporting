## ADDED Requirements

### Requirement: Active members claim one Fund mailbox once
The system SHALL let an active Fund member without a user mailbox claim one normalized non-reserved local part and derive the full address on the server from the trusted Fund email subdomain. A successful first claim SHALL make the local part immutable for the lifetime of that membership identity.

#### Scenario: Member claims available local part
- **WHEN** an active member confirms an available valid `alice` local part
- **THEN** the system creates exactly one user mailbox and returns `alice@<fund-email-subdomain>.fundworkspace.com`

#### Scenario: Member attempts rename
- **WHEN** a member with an existing mailbox submits a different local part
- **THEN** the database rejects the change and the original address remains active

#### Scenario: Concurrent duplicate claim
- **WHEN** two members in the same Fund concurrently claim the same local part
- **THEN** exactly one claim succeeds and the other receives a controlled conflict

### Requirement: Mailbox local parts are validated and reserved centrally
The database and server SHALL apply the same lowercase syntax, length, consecutive-dot, header-safety, uniqueness, and reserved-name policy. Reserved shared and operational labels including `pitch`, `expert`, `admin`, `support`, `security`, `postmaster`, and no-reply variants SHALL never be assigned to a user.

#### Scenario: Reserved or malformed local part
- **WHEN** a member submits a reserved, mixed-case, malformed, header-injection, or out-of-range local part
- **THEN** the claim fails before any mailbox or provider mutation

### Requirement: Mailbox display name follows the personal profile
The system SHALL use the member's global personal name as the default sender display name and SHALL allow later personal-name changes without changing the immutable mailbox address. All rendered email headers SHALL pass the existing header-safety validation.

#### Scenario: Member changes personal name
- **WHEN** a member updates a valid global personal name after claiming a mailbox
- **THEN** future Fund email uses the updated safe display name while the local part and historical message identity remain unchanged

### Requirement: Membership state gates mailbox use
The system SHALL require a current active matching Fund membership whenever resolving a user mailbox for inbound ownership, outbound sending, or fallback selection. Removing or disabling membership SHALL deactivate use without releasing the local part for reassignment.

#### Scenario: Former member receives or sends
- **WHEN** an inactive or removed member's mailbox is addressed or selected as sender
- **THEN** the system denies user-mailbox routing/sending and does not assign the local part to another user

### Requirement: Reserved Fund mailboxes exist independently of provider setup
Every newly created Fund SHALL contain active `pitch` and `expert` reserved mailboxes before a Resend connection exists, and the existing provider configuration SHALL activate delivery without recreating or renaming them.

#### Scenario: Fund connects Resend after creation
- **WHEN** an administrator completes the existing Fund Resend setup
- **THEN** the provider uses the creation-time Fund domain and reserved mailboxes without accepting a new slug

### Requirement: Existing mailbox identities remain stable
The migration SHALL preserve existing Fund mailbox ids, local parts, owners, display names, messages, threads, and reply routes. Existing user mailboxes SHALL become immutable at their current local part.

#### Scenario: Existing member already has mailbox
- **WHEN** the migration encounters an existing user mailbox
- **THEN** the same address continues to route and any subsequent attempt to change its local part is rejected
