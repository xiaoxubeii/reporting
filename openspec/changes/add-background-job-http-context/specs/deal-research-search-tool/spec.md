## ADDED Requirements

### Requirement: Deal Research uses HTTP-only background execution
Manual and automatic Deal Research SHALL enqueue generic background jobs and SHALL execute through an authenticated HTTP worker rather than a Cron route calling Research in-process.

#### Scenario: Manual Research request
- **WHEN** an authorized fund user requests Research for a Deal
- **THEN** the system SHALL enqueue a deduplicated user-attributed job and project the Deal state as pending

#### Scenario: Qualifying automatic Research
- **WHEN** inbound Deal processing determines that Research is enabled and the thesis-fit threshold is met
- **THEN** it SHALL enqueue a deduplicated system-attributed job for that Deal

#### Scenario: Worker resource mismatch
- **WHEN** the Deal referenced by the job payload does not exist in the job fund
- **THEN** the worker SHALL fail without reading or writing another fund's Deal

### Requirement: Existing Search endpoint supports explicit background authentication
`POST /api/search` SHALL preserve its existing browser Session and Same-Origin contract and SHALL add a distinct Job Token mode selected by the presence of a bearer Authorization header.

#### Scenario: Interactive browser Search
- **WHEN** no bearer Authorization header is present
- **THEN** Search SHALL continue to require Same-Origin JSON, a current user Session, live Search access, and the existing user/fund rate limit

#### Scenario: Background Search
- **WHEN** a valid Job Token with `search:execute` scope is present
- **THEN** Search SHALL restore the job context and execute the same category, source-policy, runtime, adapter, merge, metric, and response-envelope path as browser Search

#### Scenario: Background Search request projection
- **WHEN** the Research tool calls Search
- **THEN** the HTTP body SHALL contain only a bounded query and server-generated tool call id
- **AND** category, adapter, source, actor, fund, endpoint, and limit selection SHALL come from verified server policy rather than model input

#### Scenario: Invalid bearer with valid browser Session
- **WHEN** any bearer Authorization header is present but is not a valid current Job Token
- **THEN** Search SHALL return 401 and SHALL not fall back to Session authentication

#### Scenario: System Research Search
- **WHEN** a valid system Deal Research job calls Search
- **THEN** Search SHALL use only enabled public Web and professional sources and SHALL exclude personal Feed sources

#### Scenario: User-attributed Research Search
- **WHEN** a valid user-attributed Deal Research job calls Search
- **THEN** Search SHALL preserve the actor for live authorization and audit
- **AND** it SHALL use only enabled public Web and professional sources because Deal Research writes to a fund-shared record

### Requirement: Reporting Search is an LLM-directed provider tool
Deal Research SHALL give the configured provider one bounded `reporting_search` function tool and SHALL allow the model to decide whether to call it and what bounded query and enabled categories to use.

#### Scenario: Model requests Search
- **WHEN** the provider returns a valid `reporting_search` tool call
- **THEN** the server-side tool executor SHALL call the existing `/api/search` endpoint over HTTP with the current Job Token
- **AND** no token, actor, fund, adapter, endpoint, or scope SHALL appear in the model-visible tool schema or arguments

#### Scenario: Model does not request Search
- **WHEN** the provider returns a final grounded response without a tool call
- **THEN** Deal Research SHALL finish with an explicit no-evidence outcome rather than `done`
- **AND** it SHALL not persist model-memory output as external corroboration

#### Scenario: Invalid tool input
- **WHEN** the model submits an empty/oversized query, unknown category, extra identity/transport field, or exceeds the call limit
- **THEN** the executor SHALL return a bounded tool error or fail the Research run without invoking an unapproved source

#### Scenario: Tool query contains private or unanchored content
- **WHEN** a proposed query contains an email, control characters, a private-summary fragment, or no trusted public Deal identifier
- **THEN** the executor SHALL reject it before any external Search adapter receives it

### Requirement: Search tool output is bounded and privacy-safe
The tool executor SHALL return only bounded normalized public evidence fields needed for Research and SHALL remove internal transport metadata.

#### Scenario: Personal Feed exclusion
- **WHEN** a user-attributed Deal Research job executes Search
- **THEN** source policy SHALL exclude personal Feed adapters and results before evidence is returned to the model

#### Scenario: Large Search response
- **WHEN** Search returns more results or text than the Research tool budget
- **THEN** the executor SHALL deterministically limit result count, snippet length, and total serialized size before sending evidence to the provider

### Requirement: Research sources come from executed Search evidence
Deal Research SHALL persist sources only from normalized Search results actually returned by the tool executor to the model.

#### Scenario: Model returns invented citations
- **WHEN** final model JSON contains a URL not collected from executed Search results
- **THEN** that URL SHALL not be persisted in `research_sources`

#### Scenario: Duplicate Search sources
- **WHEN** multiple calls or adapters return the same normalized URL
- **THEN** the source collector SHALL persist one bounded source entry while retaining deterministic title selection

### Requirement: Research authorization remains live through completion
The system SHALL revalidate the job attempt, actor, membership/access, Deal/fund match, and Research enablement before worker execution, every Search call, and final Deal persistence.

#### Scenario: Access revoked during tool loop
- **WHEN** user membership or required Search access is revoked after Research starts
- **THEN** the next Search call or final persistence SHALL fail closed and SHALL not persist a completed Research result under stale authority

#### Scenario: Job attempt is superseded during provider call
- **WHEN** the active job attempt changes before the model response is persisted
- **THEN** the old worker SHALL not update Deal findings, sources, status, or error fields

### Requirement: Research execution is bounded
Each Deal Research attempt SHALL have bounded model iterations, Search calls, response sizes, HTTP timeouts, one shared deadline, and explicit terminal errors.

#### Scenario: Search or provider timeout
- **WHEN** the shared deadline or a bounded HTTP request expires
- **THEN** the attempt SHALL abort outstanding work and transition through the dispatcher retry policy without an unbounded request

#### Scenario: Repeated tool HTTP delivery
- **WHEN** the same tool call id and request are delivered more than once during an active attempt
- **THEN** Search SHALL return the persisted first result and SHALL not repeat adapters or external billing

#### Scenario: Tool-loop exhaustion
- **WHEN** the model continues requesting tools through the maximum iteration
- **THEN** Research SHALL fail explicitly and SHALL not treat partial tool output as a final finding
