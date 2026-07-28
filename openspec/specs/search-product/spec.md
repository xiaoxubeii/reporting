# search-product Specification

## Purpose
TBD - created by archiving change add-search-product. Update Purpose after archive.
## Requirements
### Requirement: Explicit bounded federated search
The system SHALL provide an authorized Search workspace that executes one validated plain-text query only after explicit submission and can search selected fund-configured categories from one request.

#### Scenario: Combined search is submitted
- **WHEN** an authorized user submits a valid query with one or more available categories selected
- **THEN** the system SHALL resolve those categories to distinct registered adapters and query them through the server-side Search boundary
- **AND** SHALL return normalized results and source statuses without exposing upstream endpoints, engine selection, parser configuration, or raw responses.

#### Scenario: Query is edited without submission
- **WHEN** the user edits the query or category selection after results have loaded
- **THEN** the system SHALL mark the displayed results as stale
- **AND** SHALL NOT call an upstream source until the user explicitly submits the updated request.

#### Scenario: Invalid query or empty category selection is submitted
- **WHEN** the query is empty, oversized, contains disallowed control characters, or selects no valid available category
- **THEN** the system SHALL reject it before calling any adapter
- **AND** SHALL return bounded validation feedback.

### Requirement: Fund-configured search categories and defaults
The system SHALL expose an ordered fund-configured category catalog whose entries map only to code-registered adapter IDs and SHALL seed sensible Feed, Web, and professional defaults without hard-coding the visible catalog in the Search UI.

#### Scenario: Search page first loads
- **WHEN** configured categories are available to the caller
- **THEN** only enabled categories marked `defaultSelected` SHALL be selected by default
- **AND** labels, descriptions, order, and mappings SHALL come from the current fund configuration.

#### Scenario: Default source is unavailable
- **WHEN** none of a category's mapped adapters are runnable because of caller access, fund source policy, registry state, or live transport availability
- **THEN** the unavailable category SHALL be disabled with a text explanation
- **AND** another available configured default SHALL remain selected when possible.

#### Scenario: Unknown source or control is submitted
- **WHEN** a client submits an unknown/disabled category ID, adapter ID, endpoint, SearXNG engine, or parser setting
- **THEN** the system SHALL reject the unsupported field before any upstream call.

#### Scenario: Fund administrator updates the catalog
- **WHEN** an authenticated fund administrator saves a valid bounded category configuration
- **THEN** the system SHALL atomically replace only that administrator's fund configuration
- **AND** SHALL support bilingual labels/descriptions, enabled/default state, order, and mappings to registered adapter IDs.

#### Scenario: Non-admin attempts to update the catalog
- **WHEN** a non-admin or a client-supplied foreign fund ID attempts a category update
- **THEN** the system SHALL deny the write
- **AND** SHALL resolve fund scope exclusively from the authenticated membership.

### Requirement: Unified adapter execution without a Provider layer
The system SHALL execute search through one code-owned `SearchAdapter` registry and bounded executor, and the browser SHALL NOT call upstream services directly or submit adapter IDs.

#### Scenario: Feed search is selected
- **WHEN** an authorized caller selects Feed search
- **THEN** the Miniflux Feed adapter SHALL query only the caller's authenticated Miniflux account
- **AND** SHALL preserve available reader, read, and saved state.

#### Scenario: Web search is selected
- **WHEN** an authorized caller selects Web search
- **THEN** the SearXNG Web adapter SHALL call only the Reporting-owned SearXNG service
- **AND** SHALL use only Bing, DuckDuckGo, Brave Standard, and Startpage Web/News engines configured by the server.

#### Scenario: Professional search is selected
- **WHEN** selected categories resolve to registered professional adapters
- **THEN** the adapter executor SHALL execute those adapters directly
- **AND** SHALL NOT substitute SearXNG `site:` queries for those adapters.

#### Scenario: Multiple categories share an adapter
- **WHEN** multiple selected categories map to the same registered adapter
- **THEN** that adapter SHALL execute exactly once
- **AND** its source-level status and provenance SHALL appear once in the response.

#### Scenario: Configuration references an unknown adapter
- **WHEN** stored configuration references an ID absent from the code registry
- **THEN** the system SHALL fail closed for that mapping without dynamic import, URL interpretation, or network execution
- **AND** SHALL preserve safe configured presentation data for administrator repair.

### Requirement: Direct public professional adapters
The system SHALL provide fixed code-reviewed adapters for PubMed, ClinicalTrials.gov, FDA/openFDA 510(k), TCTMD, and MassDevice, and SHALL directly query only adapters with an operator-approved enabled transport.

#### Scenario: Public API source is searched
- **WHEN** PubMed, ClinicalTrials.gov, or FDA is selected
- **THEN** its adapter SHALL translate the standard query into documented public API parameters
- **AND** SHALL validate the upstream response before returning normalized fields and allowlisted stable identifiers.

#### Scenario: Approved website is searched
- **WHEN** TCTMD or MassDevice is selected
- **AND** its operator-approved transport is enabled
- **THEN** its adapter SHALL call only its fixed allowlisted search endpoint and parse only the bounded search-result response
- **AND** SHALL NOT traverse or fetch result detail pages.

#### Scenario: Website transport is not approved or reachable
- **WHEN** a registered website source lacks automation permission or a reachable approved endpoint
- **THEN** the source SHALL remain visible but unavailable
- **AND** SHALL NOT attempt a network request, bypass access controls, or fall back to SearXNG.

#### Scenario: Website returns an off-domain or malformed result
- **WHEN** parsed HTML contains an unapproved result host/path, advertisement, missing required structure, unsafe content type, oversized body, or invalid redirect
- **THEN** the adapter SHALL discard unsafe candidates or fail with a source-specific status
- **AND** SHALL NOT fall back to SearXNG or return guessed fields.

### Requirement: Concurrent partial results with fixed limits
The system SHALL execute resolved adapters concurrently with bounded timeouts and SHALL apply server-owned result limits.

#### Scenario: Selected sources succeed
- **WHEN** selected sources return valid candidates
- **THEN** Feed SHALL contribute at most 10 candidates, Web at most 10 aggregate candidates, and each professional adapter at most 5 candidates
- **AND** the final response SHALL contain at most 30 merged results.

#### Scenario: One selected source fails
- **WHEN** one adapter times out, is rate-limited, or returns an invalid response while another succeeds
- **THEN** the response SHALL retain successful results
- **AND** SHALL expose a concise retryable status for the failed source rather than fail the entire request.

#### Scenario: One internal Web engine fails
- **WHEN** SearXNG returns at least one valid Web candidate while one or more of its internal engines fail
- **THEN** the user-selected Web source SHALL be reported as successful without a user-visible partial-result warning
- **AND** internal engine failures SHALL remain an operational concern rather than appear as independently selected sources.

#### Scenario: Web engines fail without a usable result
- **WHEN** SearXNG returns no valid Web candidate and reports one or more internal engine failures
- **THEN** the Web source SHALL expose a concise retryable failure status.

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
- **WHEN** multiple adapters return non-duplicate candidates
- **THEN** the system SHALL preserve native source order and interleave lists deterministically up to the final limit
- **AND** SHALL NOT compare raw adapter scores or apply AI reranking.

### Requirement: Search access and basic rate limiting
The system SHALL gate Search with feature key `search` in the existing `dealflow` domain and SHALL enforce Feeds authorization, category resolution, fund source enablement, adapter availability, and a basic per-user request rate limit before upstream calls.

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
- **THEN** the system SHALL record only adapter/source ID, timing, outcome, and result count
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
The system SHALL use Reporting design tokens, native labeled category controls, keyboard-visible focus, origin/source text labels, and text equivalents for asynchronous states.

#### Scenario: Search is used on a narrow viewport
- **WHEN** the viewport cannot accommodate the desktop category rail
- **THEN** category controls SHALL open in a filter drawer with an explicit apply action
- **AND** the query input and result list SHALL remain usable without horizontal scrolling.

#### Scenario: Source state changes asynchronously
- **WHEN** a source becomes loading, empty, unavailable, partial, failed, or rate-limited
- **THEN** the UI SHALL expose the state in text
- **AND** SHALL announce material changes through an appropriate live region.

#### Scenario: Feed reader is closed with a keyboard
- **WHEN** a keyboard user closes a Feed result reader
- **THEN** focus SHALL return to the result that opened it.
