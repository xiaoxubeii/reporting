## ADDED Requirements

### Requirement: View-specific source search
The system SHALL keep curated website/RSS discovery in Explore and provide a local personal-source filter in Following without invoking discovery.

#### Scenario: User searches Explore
- **WHEN** a user enters text or a website/RSS URL in Explore
- **THEN** the existing curated search and safe discovery behaviors remain available

#### Scenario: User searches Following
- **WHEN** a connected user enters source, endpoint, category, domain, or RSS text in Following
- **THEN** the loaded personal sources are filtered locally and no discovery request is submitted

#### Scenario: User wants to add another source
- **WHEN** a user activates the add-source action in Following
- **THEN** the URL-backed Explore view opens for curated or website/RSS discovery

### Requirement: Compact category-first management
The system SHALL render followed endpoints in compact, collapsible groups derived only from personal Miniflux categories while preserving every endpoint mutation target.

#### Scenario: Category contains followed sources
- **WHEN** Following renders a non-empty personal category
- **THEN** the category is open by default, exposes its source count, and lists each followed endpoint as one compact row

#### Scenario: Source has one endpoint
- **WHEN** a source contains exactly one followed endpoint
- **THEN** its publication name is shown once and raw RSS URL text is not repeated in the default row presentation

#### Scenario: Source has multiple endpoints
- **WHEN** a source contains multiple followed endpoints
- **THEN** every endpoint remains independently visible and actionable with enough secondary metadata to distinguish it

### Requirement: Explicit source actions
The system SHALL provide an accessible localized action menu for each followed endpoint using only supported source-management capabilities.

#### Scenario: User opens a source
- **WHEN** the user selects Open source
- **THEN** the public website, or the feed URL when no website exists, opens in a new protected browser context

#### Scenario: User copies an RSS URL
- **WHEN** the user selects Copy RSS and clipboard access succeeds
- **THEN** the exact feed URL is copied and the success is announced

#### Scenario: Clipboard access fails
- **WHEN** clipboard access rejects or is unavailable
- **THEN** the row displays a localized recoverable error instead of silently claiming success

#### Scenario: User unfollows an endpoint
- **WHEN** an authorized user selects Unfollow
- **THEN** the existing authenticated subscription deletion path runs for that endpoint and the refreshed personal catalog removes it

### Requirement: Localized responsive accessibility
The system SHALL keep the optimized Following controls keyboard-accessible, localized in English and Simplified Chinese, and free of horizontal overflow on desktop and mobile.

#### Scenario: User changes locale or viewport
- **WHEN** Following is rendered in either supported locale at desktop or mobile width
- **THEN** search, category disclosures, source metadata, actions, errors, and announcements remain readable and operable
