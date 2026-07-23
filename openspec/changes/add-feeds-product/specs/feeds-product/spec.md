# Feeds product specification

## ADDED Requirements

### Requirement: User-scoped source following

The system SHALL let an authorized reporting user discover and follow a valid website or RSS endpoint through that user's dedicated server-side Miniflux connection.

#### Scenario: Follow a discovered source

- **WHEN** a permitted user selects Follow for a discovered endpoint
- **THEN** the system SHALL create the feed in that user's Miniflux account
- **AND** SHALL NOT persist a reporting-owned source or subscription record.

#### Scenario: Website discovery remains Miniflux-owned

- **WHEN** a permitted user submits a website or RSS URL for discovery
- **THEN** the BFF SHALL validate and forward that normalized URL exactly once to the caller's Miniflux account
- **AND** SHALL return only the discovery result produced by Miniflux
- **AND** SHALL NOT fetch the website, parse feed metadata, guess conventional feed paths, or perform a reporting-owned discovery fallback.

#### Scenario: Cross-user isolation

- **WHEN** a caller references a feed, category, entry, or state belonging to another Miniflux user
- **THEN** the BFF SHALL use only the caller's mapped token
- **AND** SHALL deny or hide the foreign resource before any mutation occurs.

### Requirement: Today feed

The system SHALL show entries from the caller's Miniflux account, ordered and paginated by Miniflux, with Miniflux status/starred fields normalized to read/saved state.

#### Scenario: Entries are grouped by Miniflux category

- **WHEN** Today displays entries from more than one source
- **THEN** the product SHALL group the visible entries under their caller-owned Miniflux category names
- **AND** SHALL preserve Miniflux entry ordering within each category
- **AND** SHALL NOT create or persist a reporting-owned category model.

#### Scenario: Read state is personal

- **WHEN** one reporting user marks an entry read or starred
- **THEN** the mutation SHALL be written only to that user's Miniflux account
- **AND** another reporting user's state SHALL remain unchanged.

#### Scenario: Miniflux is unavailable

- **WHEN** entries cannot be loaded from the configured Miniflux instance
- **THEN** Today SHALL display an explicit retryable error
- **AND** SHALL NOT display fixture or stale fabricated rows.

### Requirement: Feedly-inspired reader interaction

The system SHALL provide a responsive article reader overlay that preserves the reporting shell and accessibility behavior.

#### Scenario: Open and close an article

- **WHEN** a user opens an article from Today
- **THEN** the URL SHALL identify the selected entry
- **AND** the reader SHALL show title, source, time, safe content, state controls, and an original-site link
- **AND** closing by control, Escape, or browser back SHALL restore the list context.

### Requirement: Secure Miniflux boundary

The system SHALL keep Miniflux credentials encrypted and server-only.

The Miniflux instance URL and administrator provisioning credentials SHALL come from server deployment configuration. When automatic provisioning is enabled, each approved reporting user SHALL receive one dedicated non-admin Miniflux user and one Reporting-specific API token without entering a token in the browser.

reporting SHALL store only the encrypted per-user connection mapping. The browser SHALL access feeds only through reporting BFF APIs and SHALL NOT receive a Miniflux credential or direct feed-table access.

#### Scenario: Connection status is read

- **WHEN** any permitted caller requests connection status
- **THEN** the response SHALL report only connection metadata and health
- **AND** SHALL NOT include the API token or ciphertext.

#### Scenario: Reporting account is approved

- **WHEN** a fund administrator approves a pending reporting account and automatic provisioning is enabled
- **THEN** the server SHALL ensure a deterministic dedicated non-admin Miniflux user exists
- **AND** SHALL issue or reuse a Reporting-specific API token as that Miniflux user
- **AND** SHALL encrypt and bind the token to the approved reporting user before approval completes
- **AND** SHALL NOT store the temporary Miniflux password or administrator credential in reporting data.

#### Scenario: Approval provisioning is retried

- **WHEN** an approval request is retried after a partial Miniflux provisioning failure
- **THEN** the server SHALL reconcile the existing managed Miniflux user and Reporting API key
- **AND** SHALL NOT create a second Miniflux user for the same reporting user.

#### Scenario: Miniflux provisioning fails

- **WHEN** Miniflux, its provisioner API key, or encrypted connection storage is unavailable during approval
- **THEN** the approval SHALL fail with a safe retryable error
- **AND** the reporting join request SHALL remain pending.

#### Scenario: Feed data is requested

- **WHEN** the browser requests sources, subscriptions, entries, read state, or starred state
- **THEN** the reporting BFF SHALL obtain the data from Miniflux using only the caller's mapped token
- **AND** SHALL NOT read a reporting-owned feed data or state table.

#### Scenario: Untrusted article content is displayed

- **WHEN** an entry contains HTML, scripts, event handlers, or non-HTTP links
- **THEN** the product SHALL render only safe derived text and validated HTTP(S) media/original URLs.

### Requirement: Explicit feature access

The system SHALL gate Feeds independently with a `feeds` feature inside the existing `dealflow` domain.

#### Scenario: Feeds is switched off

- **WHEN** the fund's `feeds` feature is off
- **THEN** the navigation SHALL be hidden and direct page/API access SHALL be denied for every role.

#### Scenario: Personal feed management

- **WHEN** a member has read access
- **THEN** the member SHALL be able to connect and manage only their own Miniflux subscriptions, entries, read state, and starred state
- **AND** SHALL NOT be able to access another member's Miniflux connection or data.
