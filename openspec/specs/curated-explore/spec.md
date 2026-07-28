# curated-explore Specification

## Purpose
TBD - created by archiving change add-curated-explore. Update Purpose after archive.
## Requirements
### Requirement: Deployment-wide curated collector
The system SHALL read Curated Explore from the deployment-wide `reporting_explore` Miniflux user and MUST verify its configured user ID, exact username, and non-administrator role before returning collector data.

#### Scenario: Authorized user opens Explore
- **WHEN** an authorized Reporting user opens Explore and the configured collector is a non-admin Miniflux user
- **THEN** the system returns categories and articles from that shared collector regardless of the user's personal Miniflux connection state

#### Scenario: Collector token belongs to an administrator
- **WHEN** the configured collector token resolves to an administrator identity
- **THEN** the system fails closed with a safe configuration error and returns no collector data or credential detail

### Requirement: Server-only collector credential
The system MUST load the collector token only on the server, MUST prefer a configured secret file over a direct environment value, and MUST NOT expose the token through browser responses, client bundles, logs, or error messages.

#### Scenario: Secret file and environment value are both configured
- **WHEN** both collector token sources are present
- **THEN** the system uses the secret file value and never returns either secret to the client

#### Scenario: Collector credential is unavailable
- **WHEN** the token is missing, empty, oversized, or its configured file cannot be read
- **THEN** Explore returns a safe `not_configured` failure without leaking configuration contents

### Requirement: Read-only Explore content
The system SHALL expose curated categories, latest article lists, and article detail through authenticated Reporting BFF endpoints, and MUST omit collector read and saved state and MUST NOT mutate collector entries, feeds, categories, or user state.

#### Scenario: User lists articles in a category
- **WHEN** the user requests Explore articles with a valid curated category reference, search query, limit, and offset
- **THEN** the system returns bounded latest articles from that collector category with pagination metadata and without `isRead` or `isSaved`

#### Scenario: User opens an Explore article
- **WHEN** the user opens a valid Explore article
- **THEN** the system returns read-only article detail without marking it read or offering shared read/save mutations

#### Scenario: User attempts an unsupported collector mutation
- **WHEN** a client attempts to use an Explore endpoint to change collector read state, saved state, subscriptions, or categories
- **THEN** no such mutation contract is available and the collector remains unchanged

### Requirement: Typed collector references
The system MUST represent collector categories, sources, and entries with distinct namespaced references and MUST validate both reference syntax and collector ownership at the server boundary.

#### Scenario: Reference has the expected type and owner
- **WHEN** an Explore operation receives a correctly namespaced positive-integer reference and the referenced object is readable through the configured collector
- **THEN** the system processes it as that collector resource type

#### Scenario: Reference is malformed or has the wrong namespace
- **WHEN** an Explore operation receives a malformed, oversized, non-positive, unsafe, or wrong-type reference
- **THEN** the system rejects it with a safe client error without querying or mutating a personal Miniflux account

#### Scenario: Source does not belong to the collector
- **WHEN** a syntactically valid source reference cannot be resolved from the configured collector's feeds
- **THEN** the system returns a safe not-found result and performs no personal subscription mutation

### Requirement: Safe personal follow-through
The system SHALL let an authorized user follow a curated source by resolving its trusted feed URL from the collector and passing only that server-resolved URL to the existing personal Miniflux subscription service for the current Reporting user.

#### Scenario: User follows a curated source
- **WHEN** the user submits a valid collector-owned source reference
- **THEN** the source is followed in that user's personal Miniflux account and the collector is not modified

#### Scenario: Browser submits source metadata
- **WHEN** a client attempts to supply a feed URL, title, category, or other source metadata with the Follow request
- **THEN** the system ignores or rejects that metadata and resolves the source from the collector

#### Scenario: Source is already followed
- **WHEN** the resolved feed URL is already present in the user's personal Miniflux account
- **THEN** the Follow operation succeeds idempotently without creating a duplicate subscription

#### Scenario: User returns after following a source
- **WHEN** the user reloads Explore after following a curated source
- **THEN** the system resolves that source against the caller's personal Miniflux feeds and shows it as `Following`
- **AND** a failure to load this personal indicator does not prevent curated articles from loading

#### Scenario: Different users follow the same source
- **WHEN** two Reporting users follow the same curated source
- **THEN** each subscription is written only through that user's personal Miniflux credentials and neither user's personal state affects the other

### Requirement: Today provides separate Me and Explore views
The system SHALL present `Me` and `Explore` as sibling views inside Today while preserving the existing personal Today behavior and keeping Explore controls read-only except for personal Follow.

#### Scenario: User views Me
- **WHEN** the selected Today view is `Me`
- **THEN** the system uses the existing personal entries, filters, connection states, read state, and saved state behavior

#### Scenario: User views Explore
- **WHEN** the selected Today view is `Explore`
- **THEN** the system shows curated categories, latest articles, search, pagination, article detail, and Follow controls without personal Unread/All/Saved or Mark-all-read controls

#### Scenario: User reloads or shares the selected view
- **WHEN** the Today URL identifies `Me` or `Explore`
- **THEN** reload and navigation preserve the selected view without mixing its pagination or filter state with the other view

### Requirement: Explore failures remain isolated
The system MUST keep collector availability and personal Miniflux availability as independent failure domains.

#### Scenario: Collector is unavailable
- **WHEN** the collector cannot be reached or returns an invalid response
- **THEN** Explore shows a safe retryable failure while `Me` continues to use the existing personal endpoints

#### Scenario: Personal Miniflux is unavailable
- **WHEN** the user's personal Miniflux account is not connected or cannot be reached
- **THEN** Explore browsing remains available and only a personal Follow attempt returns the relevant safe personal-account error

### Requirement: No Reporting persistence for V1 Explore
The system MUST NOT add Reporting database tables, article mirrors, subscription mirrors, read-state mirrors, saved-state mirrors, webhooks, clustering, trend scoring, or AI summaries for V1 Explore.

#### Scenario: Explore serves content
- **WHEN** categories, article lists, or article detail are requested
- **THEN** the system reads Miniflux through the BFF and creates no Reporting feed record as a side effect
