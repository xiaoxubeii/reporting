# scoped-settings Specification

## Purpose
TBD - created by archiving change add-fund-identity-onboarding. Update Purpose after archive.
## Requirements
### Requirement: Settings separates Personal and Current Fund scopes
The authenticated Settings experience SHALL expose visually distinct Personal and Current Fund navigation groups and routes. Personal pages SHALL remain bound to the auth user; Fund pages SHALL remain bound to the current trusted Fund and live membership.

#### Scenario: User opens Settings
- **WHEN** an authenticated user enters Settings
- **THEN** navigation clearly labels Personal settings and `Current Fund: <name>` Fund settings without mixing their fields in one undifferentiated page

#### Scenario: User changes Fund context
- **WHEN** the trusted Fund context differs on a later request
- **THEN** Fund settings resolve only that Fund while the same personal profile remains available

### Requirement: Personal Settings owns user-level controls
Personal Settings SHALL contain global real name, read-only external login email, existing account security/MFA controls, language/theme preferences, and the current Fund business-mailbox claim/status. Personal profile writes SHALL NOT require Fund administrator privilege.

#### Scenario: Member edits own profile
- **WHEN** a normal Fund member updates a valid personal name or preference
- **THEN** the system saves only that user's personal data and does not modify Fund configuration or another member

### Requirement: Fund Settings owns tenant-level controls
Current Fund Settings SHALL contain Fund display name/branding, read-only tenant and email identities, members/invitations, existing inbound/outbound providers, AI/integrations, business configuration, public site, and audit controls. Every mutation SHALL use the existing domain access policy for that setting.

#### Scenario: Administrator edits Fund configuration
- **WHEN** a current administrator changes an authorized mutable Fund setting
- **THEN** only the current trusted Fund changes and the response contains no provider secret

#### Scenario: Member opens administrator setting
- **WHEN** a normal member navigates to an administrator-only Fund setting or invokes its API
- **THEN** the page and API return a controlled denial while Personal Settings remains accessible

#### Scenario: Normal member lists colleagues
- **WHEN** a normal member views an allowed member directory surface
- **THEN** the response contains only necessary names, roles, and internal business addresses and omits external Auth emails, invitation records, and provider secrets

### Requirement: Fund identity is explicit and read-only
Every Fund Settings root SHALL display the current Fund name and persisted tenant/email identities. It SHALL NOT render an editable slug or domain field after creation, including inside existing inbound and outbound provider controls.

#### Scenario: Administrator configures Resend
- **WHEN** an administrator opens the existing inbound or outbound Resend provider section
- **THEN** the Fund domain is shown as server-derived read-only context and only provider credentials/actions are editable

### Requirement: Setup checklist reflects authoritative state
The Current Fund setup page SHALL derive completion from profile, mailbox, branding, email-provider, and invitation/member records rather than trusting client-supplied completion flags. It SHALL link to the correct Personal or Fund setting for each incomplete step.

#### Scenario: Completed step becomes stale
- **WHEN** a provider is disconnected or an invitation is revoked after setup
- **THEN** the checklist recomputes the authoritative state and reflects the change without corrupting unrelated steps

### Requirement: Scoped Settings is localized and responsive
All new navigation, forms, validation, status, empty, loading, and error copy SHALL be complete in English and Simplified Chinese and SHALL remain usable without horizontal overflow on supported mobile widths.

#### Scenario: User switches language on mobile
- **WHEN** a user switches between English and Simplified Chinese on a 390-pixel-wide Settings page
- **THEN** both scope groups, current Fund identity, forms, dialogs, and status feedback update consistently without clipping
