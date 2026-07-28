# memo-research-reporting-search Specification

## Purpose
TBD - created by archiving change replace-memo-research-web-search. Update Purpose after archive.
## Requirements
### Requirement: Memo Research uses product Search as an LLM tool
When external Search is enabled, the system SHALL expose the code-owned `reporting_search` tool to each Memo Research sub-call and SHALL execute searches through the product Search runtime rather than provider-native web search.

#### Scenario: Tool-capable provider runs external research
- **WHEN** an authorized user starts Memo Research with external Search enabled and the configured provider supports custom tool loops
- **THEN** the model can autonomously invoke `reporting_search` and receive normalized product Search evidence
- **AND** provider-native web search is not attached

#### Scenario: Provider lacks tool-loop support
- **WHEN** external Search is enabled but the configured provider does not support custom tool loops
- **THEN** the stage completes in explicit no-search mode with a visible warning
- **AND** no finding is represented as externally verified solely from model memory

### Requirement: Search execution preserves background authorization
Every Memo Research Search call MUST originate from a live generalized background-job attempt that restores the initiating actor and fund context and revalidates required diligence and Search access.

#### Scenario: Authorized live attempt
- **WHEN** a live `memo_research` attempt issues a Search tool call using its attempt-bound token
- **THEN** `/api/search` executes it under that fund and actor's current source and access policies

#### Scenario: Forged stale revoked or cross-fund attempt
- **WHEN** a Search call has a forged token, stale attempt, revoked actor, mismatched fund, reused conflicting tool-call ID, or lost Search entitlement
- **THEN** the request fails closed without returning evidence or persisting a successful tool call

### Requirement: One bounded budget covers all research sub-calls
The claims, competitors, and founders research sub-calls MUST share one database-enforced Search call budget for the complete Memo Research job.

#### Scenario: Parallel calls remain within the job limit
- **WHEN** multiple research sub-calls request Search concurrently
- **THEN** the system atomically permits no more than the configured `memo_research` maximum across the whole attempt
- **AND** distinct sub-call namespaces prevent provider tool-call ID collisions

#### Scenario: Limit exceeded
- **WHEN** a model requests another search after the job budget is exhausted
- **THEN** the tool returns a bounded rate-limit error and the model must finish from collected evidence or report a research gap

### Requirement: Public query construction does not disclose private deal content
The system MUST construct public Search queries from validated public deal identifiers and a bounded research topic vocabulary, and MUST NOT accept arbitrary data-room text as a public query.

#### Scenario: Medical claim verification topic
- **WHEN** the model selects a clinical, regulatory, technology, intellectual-property, market, company, competitor, founder, or website research topic
- **THEN** server code constructs a bounded query using approved public company/domain/founder identifiers

#### Scenario: Unsafe tool argument
- **WHEN** tool arguments contain unsupported keys, free-form private text, an email address, control characters, or an unsupported topic
- **THEN** the tool rejects the invocation before contacting Search

### Requirement: Research citations are grounded in Search source IDs
The system SHALL treat code-collected Search source IDs as the authoritative citation registry and MUST validate model-returned citations before persisting research output.

#### Scenario: Valid grounded finding
- **WHEN** a finding cites one or more source IDs returned during the active job
- **THEN** the system persists those IDs and maps their normalized titles and URLs into the partner-facing research output

#### Scenario: Invented or foreign citation
- **WHEN** the model returns a URL, title, or source ID that was not collected by the active job
- **THEN** the system excludes the unsupported citation and does not mark the finding externally verified from it

### Requirement: Existing research workflow remains compatible
The system SHALL preserve the existing diligence Research launch, progress, result, and downstream memo-stage contracts while transitioning to provider-neutral Search fields.

#### Scenario: Partner runs research from the diligence page
- **WHEN** the partner selects “Run research” after ingestion
- **THEN** the system atomically creates a generalized execution job linked to one Memo UI projection
- **AND** the UI receives a job identifier, observes progress, and renders findings, contradictions, competitors, founders, gaps, source diagnostics, and terminal status as before

#### Scenario: Legacy worker claim isolation
- **WHEN** the legacy Memo worker claims pending work
- **THEN** it excludes research projections linked to generalized background jobs
- **AND** the generalized worker is the only executor for those research jobs

#### Scenario: Transitional output consumer
- **WHEN** an existing consumer reads `web_sources` or `web_search_count`
- **THEN** it receives values mirrored from the new provider-neutral Search source registry and count during the compatibility period

### Requirement: Legacy native search is rollback-only
The Anthropic native-search implementation MUST be disabled by default and MUST be selectable only through a server-controlled rollback flag during the migration window.

#### Scenario: Normal production configuration
- **WHEN** external Search is enabled and no rollback flag is set
- **THEN** Memo Research uses only the code-owned product Search tool

#### Scenario: Emergency rollback
- **WHEN** an operator enables the documented legacy rollback flag and the provider supports Anthropic native search
- **THEN** the stage can use the legacy path without changing persisted user settings
