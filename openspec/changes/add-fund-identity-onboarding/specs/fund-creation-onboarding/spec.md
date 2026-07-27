## ADDED Requirements

### Requirement: Fund creation reserves a user-selected immutable identity
The system SHALL require a platform-hosted, authenticated user without an existing Fund membership to submit a Fund display name and DNS-safe slug. The slug SHALL be normalized, checked against reserved labels and uniqueness constraints, and used for both the new Fund's canonical tenant identity and initial Fund email subdomain.

#### Scenario: Available Fund identity
- **WHEN** an eligible founder confirms an available `cci` slug
- **THEN** the new Fund persists `cci` as its stable tenant slug and initial email subdomain and presents `cci.fundworkspace.com` before confirmation

#### Scenario: Concurrent duplicate identity
- **WHEN** two founders concurrently attempt to reserve the same normalized slug
- **THEN** exactly one Fund is created and the other request receives a controlled conflict without partial membership, settings, or mailbox rows

#### Scenario: Tenant-hosted creation attempt
- **WHEN** a caller attempts Fund creation from a tenant hostname
- **THEN** the system denies creation without trusting a client-supplied Fund or slug

### Requirement: Founder bootstrap is atomic
The system SHALL create the Fund, founder administrator membership, required Fund settings and encryption envelope, reserved `pitch` and `expert` mailboxes, and initial setup state in one database transaction. External provider credentials and optional AI configuration SHALL NOT be prerequisites for Fund creation. Authenticated Data API grants and policies SHALL NOT permit callers to bypass this transaction with direct Fund or membership inserts.

#### Scenario: Bootstrap succeeds
- **WHEN** all required inputs and server encryption configuration are valid
- **THEN** the transaction returns one Fund owned by the founder with all required bootstrap records and no external-email-domain membership metadata

#### Scenario: Bootstrap fails
- **WHEN** any required insert, constraint, encryption prerequisite, or reserved mailbox operation fails
- **THEN** the transaction creates none of the Fund, membership, settings, or mailbox records

#### Scenario: Caller writes Fund through Data API
- **WHEN** an authenticated caller attempts to insert a Fund or membership directly instead of using the bootstrap or invitation transaction
- **THEN** database privileges and policies deny the write

#### Scenario: Founder repeats creation request
- **WHEN** the same founder repeats a completed request
- **THEN** the system returns only the same actor-and-slug result or a controlled conflict and never changes the existing Fund name, role, encryption envelope, or integration credentials

### Requirement: Fund business identity cannot be renamed
The system SHALL reject any post-creation change to a persisted Fund slug or email subdomain, regardless of whether a mail provider is connected. The mutable Fund display name SHALL remain independent.

#### Scenario: Administrator renames Fund display name
- **WHEN** an administrator changes only the Fund display name
- **THEN** the name changes while tenant and email identities remain byte-for-byte unchanged

#### Scenario: Administrator attempts slug change
- **WHEN** any authenticated or service path attempts to change the persisted slug or email subdomain
- **THEN** the database rejects the change and canonical links and addresses remain unchanged

#### Scenario: Administrator attempts hard deletion
- **WHEN** any application or Data API path attempts to hard-delete a Fund
- **THEN** the database rejects deletion so the tenant slug, email subdomain, and historical mailbox namespace remain permanently reserved

### Requirement: Existing Fund identities migrate without silent renaming
The migration SHALL preserve every existing stable tenant slug and every configured email subdomain, including identities whose labels became reserved after creation. An existing Fund missing an email subdomain SHALL receive its slug when safe or a valid non-reserved deterministic conflict-safe fallback, while any pre-existing slug/subdomain difference SHALL be shown read-only and SHALL NOT be silently reconciled. Current reserved-label rules SHALL apply to new creation without making a preserved historical Host or email identity unreachable.

#### Scenario: Existing connected Fund has different identities
- **WHEN** an existing Fund has a stable tenant slug and a different verified email subdomain
- **THEN** both values remain unchanged and its provider, links, mailboxes, and routing continue to resolve

### Requirement: Founder setup is resumable
The system SHALL redirect a successfully created Fund to its canonical tenant origin and expose a checklist computed from persisted profile, mailbox, branding, email-provider, and membership state. Optional incomplete steps SHALL NOT block authentication or ordinary authorized navigation.

#### Scenario: Founder leaves setup early
- **WHEN** the founder completes only the Fund creation transaction and later returns
- **THEN** the checklist recomputes the remaining steps and allows work to resume without recreating the Fund
