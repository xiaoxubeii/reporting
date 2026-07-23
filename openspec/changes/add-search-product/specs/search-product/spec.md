## ADDED Requirements

### Requirement: Explicit bounded federated search
The system SHALL provide an authorized Search workspace that executes one validated plain-text query only after explicit submission and can search selected Feed, Web, and professional sources from one request.

#### Scenario: Combined search is submitted
- **WHEN** an authorized user submits a valid query with Feed, Web, and one or more professional sources selected
- **THEN** the system SHALL query the selected sources through the server-side Search boundary
- **AND** SHALL return normalized results and source statuses without exposing upstream endpoints, engine selection, parser configuration, or raw responses.

#### Scenario: Query is edited without submission
- **WHEN** the user edits the query or source selection after results have loaded
- **THEN** the system SHALL mark the displayed results as stale
- **AND** SHALL NOT call an upstream source until the user explicitly submits the updated request.

#### Scenario: Invalid query or empty source selection is submitted
- **WHEN** the query is empty, oversized, contains disallowed control characters, or selects no available source
- **THEN** the system SHALL reject it before calling any provider
- **AND** SHALL return bounded validation feedback.

### Requirement: Fixed source catalog and defaults
The system SHALL expose Feed and Web plus exactly `pubmed`, `clinical_trials`, `fda`, `tctmd`, and `massdevice` as the first-release professional catalog.

#### Scenario: Search page first loads
- **WHEN** Feed and Web are available to the caller
- **THEN** Feed and Web SHALL be selected by default
- **AND** every professional source SHALL be visible and unselected by default.

#### Scenario: Default source is unavailable
- **WHEN** the caller lacks a usable Miniflux connection, Feeds read access, or an available SearXNG provider
- **THEN** the unavailable source SHALL be disabled with a text explanation
- **AND** another available default source SHALL remain selected when possible.

#### Scenario: Unknown source or control is submitted
- **WHEN** a client submits an unregistered source ID, endpoint, SearXNG engine, or parser setting
- **THEN** the system SHALL reject the unsupported field before any upstream call.

### Requirement: Exactly three provider boundaries
The system SHALL execute search through `FeedSearchProvider`, `WebSearchProvider`, and `SpecializedSearchProvider`, and the browser SHALL NOT call their upstream services directly.

#### Scenario: Feed search is selected
- **WHEN** an authorized caller selects Feed search
- **THEN** `FeedSearchProvider` SHALL query only the caller's authenticated Miniflux account
- **AND** SHALL preserve available reader, read, and saved state.

#### Scenario: Web search is selected
- **WHEN** an authorized caller selects Web search
- **THEN** `WebSearchProvider` SHALL call only the Reporting-owned SearXNG service
- **AND** SHALL use only Bing, DuckDuckGo, Brave Standard, and Startpage Web/News engines configured by the server.

#### Scenario: Professional search is selected
- **WHEN** an authorized caller selects registered professional sources
- **THEN** `SpecializedSearchProvider` SHALL execute their code-registered adapters directly
- **AND** SHALL NOT substitute SearXNG `site:` queries for those adapters.

### Requirement: Direct public professional adapters
The system SHALL directly query PubMed, ClinicalTrials.gov, FDA/openFDA, TCTMD, and MassDevice through fixed code-reviewed adapters.

#### Scenario: Public API source is searched
- **WHEN** PubMed, ClinicalTrials.gov, or FDA is selected
- **THEN** its adapter SHALL translate the standard query into documented public API parameters
- **AND** SHALL validate the upstream response before returning normalized fields and allowlisted stable identifiers.

#### Scenario: Approved website is searched
- **WHEN** TCTMD or MassDevice is selected
- **THEN** its adapter SHALL call only its fixed allowlisted search endpoint and parse only the bounded search-result response
- **AND** SHALL NOT traverse or fetch result detail pages.

#### Scenario: Website returns an off-domain or malformed result
- **WHEN** parsed HTML contains an unapproved result host/path, advertisement, missing required structure, unsafe content type, oversized body, or invalid redirect
- **THEN** the adapter SHALL discard unsafe candidates or fail with a source-specific status
- **AND** SHALL NOT fall back to SearXNG or return guessed fields.

### Requirement: Concurrent partial results with fixed limits
The system SHALL execute selected providers and professional adapters concurrently with bounded timeouts and SHALL apply server-owned result limits.

#### Scenario: Selected sources succeed
- **WHEN** selected sources return valid candidates
- **THEN** Feed SHALL contribute at most 10 candidates, Web at most 10 aggregate candidates, and each professional adapter at most 5 candidates
- **AND** the final response SHALL contain at most 30 merged results.

#### Scenario: One selected source fails
- **WHEN** one provider or professional adapter times out, is rate-limited, or returns an invalid response while another succeeds
- **THEN** the response SHALL retain successful results
- **AND** SHALL expose a concise retryable status for the failed source rather than fail the entire request.

### Requirement: Exact deterministic merging and origin-correct actions
The system SHALL merge exact duplicates while preserving all provenance and SHALL choose primary origin using `Feed > Specialized > Web`.

#### Scenario: Exact URL is duplicated
- **WHEN** multiple sources return the same canonical safe HTTP(S) URL
- **THEN** the system SHALL display one result with all matching source labels
- **AND** SHALL choose Feed over Specialized over Web as the primary origin.

#### Scenario: Professional record is duplicated
- **WHEN** results share an exact allowlisted DOI, PMID, NCT, or FDA identifier
- **THEN** the system SHALL group them and preserve their stable identifiers and source labels
- **AND** SHALL NOT use fuzzy-title or AI similarity matching.

#### Scenario: Feed-primary result is opened
- **WHEN** a merged result has Feed as its primary origin
- **THEN** the system SHALL use the authenticated Feed reader and preserve read/saved behavior
- **AND** SHALL retain any matching professional identifiers and provenance.

#### Scenario: External-primary result is opened
- **WHEN** a result has Specialized or Web as its primary origin
- **THEN** the system SHALL open the validated original HTTP(S) URL with opener isolation
- **AND** SHALL NOT offer Miniflux read or saved mutations.

#### Scenario: Multiple source lists are merged
- **WHEN** multiple providers return non-duplicate candidates
- **THEN** the system SHALL preserve native source order and interleave lists deterministically up to the final limit
- **AND** SHALL NOT compare raw provider scores or apply AI reranking.

### Requirement: Search access and basic rate limiting
The system SHALL gate Search with feature key `search` in the existing `dealflow` domain and SHALL enforce Feeds authorization, provider/source enablement, and a basic per-user request rate limit before upstream calls.

#### Scenario: Search feature is disabled
- **WHEN** the fund's Search feature is disabled
- **THEN** Search navigation SHALL be hidden
- **AND** direct page and API access SHALL be denied.

#### Scenario: Feed source is requested without Feed access
- **WHEN** a caller has Search access but lacks permitted Feeds read access
- **THEN** Feed search SHALL be unavailable
- **AND** the system SHALL NOT resolve a Miniflux credential for that caller.

#### Scenario: User rate limit is exceeded
- **WHEN** a caller exceeds the bounded Search request rate
- **THEN** the system SHALL reject the request before upstream calls
- **AND** SHALL return a retryable rate-limit status.

### Requirement: Search privacy and safe external content
The system SHALL treat all upstream fields as untrusted, render bounded plain text and validated public HTTP(S) URLs only, and SHALL NOT retain raw queries or result bodies.

#### Scenario: Operational metrics are recorded
- **WHEN** an upstream attempt completes or fails
- **THEN** the system SHALL record only provider/source ID, timing, outcome, and result count
- **AND** SHALL omit raw queries, result bodies, and external HTML.

#### Scenario: Upstream result contains unsafe fields
- **WHEN** a source returns HTML snippets, malformed or credential-bearing URLs, unsafe schemes, private-network targets, oversized strings, embedded instructions, remote assets, or unexpected fields
- **THEN** the system SHALL discard or reduce them to bounded plain text and validated allowlisted/public HTTP(S) URLs
- **AND** SHALL never execute source content, inject source HTML, or download remote assets.

#### Scenario: Browser preserves page state
- **WHEN** the user navigates within the Search workspace
- **THEN** raw search queries SHALL NOT be placed in normal request URLs, server logs, persisted search history, or shareable URLs
- **AND** search execution SHALL remain an authenticated POST request.

### Requirement: Responsive and accessible Search UI
The system SHALL use Reporting design tokens, native labeled source controls, keyboard-visible focus, origin/source text labels, and text equivalents for asynchronous states.

#### Scenario: Search is used on a narrow viewport
- **WHEN** the viewport cannot accommodate the desktop source rail
- **THEN** source controls SHALL open in a filter drawer with an explicit apply action
- **AND** the query input and result list SHALL remain usable without horizontal scrolling.

#### Scenario: Source state changes asynchronously
- **WHEN** a source becomes loading, empty, unavailable, partial, failed, or rate-limited
- **THEN** the UI SHALL expose the state in text
- **AND** SHALL announce material changes through an appropriate live region.

#### Scenario: Feed reader is closed with a keyboard
- **WHEN** a keyboard user closes a Feed result reader
- **THEN** focus SHALL return to the result that opened it.
