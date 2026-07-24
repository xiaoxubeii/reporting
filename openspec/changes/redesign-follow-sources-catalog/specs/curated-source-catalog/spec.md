## ADDED Requirements

### Requirement: URL-backed discovery and management views
The system SHALL present curated source discovery and personal source management as separate views on `/feeds/sources`, defaulting to curated discovery and representing the selected view in the URL.

#### Scenario: User opens Follow sources without a view parameter
- **WHEN** an authorized user opens `/feeds/sources`
- **THEN** the Explore sources view is active and curated discovery content is shown

#### Scenario: User selects Following
- **WHEN** the user selects the Following view
- **THEN** the URL records `view=following` and the existing personal connection, folder, health, Follow-category, and Unfollow controls are available

### Requirement: Read-only curated source catalog
The system SHALL expose collector-owned sources through an authenticated, rate-limited, read-only API using namespaced source and category references.

#### Scenario: Catalog is requested without filters
- **WHEN** an authorized user requests the curated source catalog
- **THEN** the response contains source title, public site URL, category summary, and namespaced references without collector credentials, personal article state, or trusted mutation metadata

#### Scenario: Catalog is filtered
- **WHEN** a bounded text query or collector-owned category reference is provided
- **THEN** only sources matching title, site, or category are returned

#### Scenario: Catalog filter is invalid
- **WHEN** a category reference is malformed, belongs outside the collector, or a query exceeds its bound
- **THEN** the request fails with a controlled 4xx response and no collector data is leaked

### Requirement: Featured category cards
The system SHALL render responsive curated category cards containing the category title, source count, and one deterministic featured source when the category contains a source.

#### Scenario: Category has curated sources
- **WHEN** the Explore sources view loads a populated category
- **THEN** its card shows the category, count, and the earliest curated collector source with a source icon fallback

#### Scenario: User opens a category
- **WHEN** the user activates a category card
- **THEN** a responsive source Sheet opens, the URL records the namespaced category reference, and browser Back closes or restores the Sheet correctly

### Requirement: Unified text and RSS discovery
The system SHALL provide one search surface that searches curated sources for text and uses the existing safe website/RSS discovery flow for a valid public HTTP(S) URL.

#### Scenario: User enters text
- **WHEN** the user enters a non-URL query in Explore sources
- **THEN** matching curated sources are displayed without invoking website discovery

#### Scenario: User submits a website or RSS URL
- **WHEN** the user submits a valid public HTTP(S) URL
- **THEN** the existing SSRF-protected discovery endpoint returns candidate feeds and each candidate exposes the existing personal Follow-category interaction

### Requirement: Personal Follow-state projection
The system SHALL show whether each curated source is already present in the current user's personal Miniflux account without mutating collector state.

#### Scenario: Curated source is not followed
- **WHEN** a connected user follows a catalog source
- **THEN** the client submits only its namespaced collector reference, the server revalidates collector ownership, and the source is idempotently added only to that user's personal account

#### Scenario: Personal account is unavailable
- **WHEN** curated catalog loading succeeds but personal connection or Follow-state projection is unavailable
- **THEN** catalog browsing remains available and mutation controls communicate that Follow is unavailable rather than presenting a false personal state

### Requirement: Preserved personal source management
The system SHALL retain the existing personal Miniflux source-management behavior in the Following view.

#### Scenario: Connected user manages personal sources
- **WHEN** a connected user opens Following
- **THEN** personal folders, source endpoints, health state, category selection, arbitrary URL discovery, and Unfollow operate with their existing contracts

#### Scenario: Personal account requires setup
- **WHEN** the user has no usable personal Miniflux connection
- **THEN** the existing managed provisioning or non-admin token connection recovery is shown without preventing read-only curated catalog browsing

### Requirement: Accessible localized responsive presentation
The system SHALL localize the catalog experience in English and Simplified Chinese and keep tabs, cards, search results, Follow controls, and Sheets usable without horizontal page overflow on desktop and mobile.

#### Scenario: User changes locale or viewport
- **WHEN** the page is rendered in either supported locale at desktop or mobile width
- **THEN** semantic labels update, keyboard focus remains visible, the category grid reflows, Sheets stay within the viewport, and no unsupported connector or language control is shown
