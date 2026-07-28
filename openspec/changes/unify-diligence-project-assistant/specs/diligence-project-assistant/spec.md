## ADDED Requirements

### Requirement: Project-scoped global Assistant
The system SHALL bind the global Assistant to the current diligence project on project detail, draft, and legacy Q&A pages while preserving all non-diligence Assistant scopes.

#### Scenario: Open Assistant on a project page
- **WHEN** an authorized user opens the Assistant from any page under a diligence project
- **THEN** the server uses the exact project scope and answers from that project's evidence

#### Scenario: Navigate away from the project
- **WHEN** the user leaves the project scope
- **THEN** the project identifier and project conversation state are cleared without changing generic Assistant behavior

### Requirement: Private and scope-safe project history
The system MUST store new project conversations as user-owned private history and MUST restore messages only after verifying Fund, owner, exact scope, and current domain access.

#### Scenario: Client submits forged assistant history
- **WHEN** a new request contains client-supplied assistant turns or citations
- **THEN** the server ignores them and processes only the newest user turn

#### Scenario: Access is revoked
- **WHEN** a user loses diligence read access
- **THEN** project conversation list, detail, and answer endpoints return forbidden and direct Data API access remains unavailable

#### Scenario: Two turns append concurrently
- **WHEN** two requests continue the same stored message version
- **THEN** one append persists atomically and the stale append is reported as unsaved without overwriting history or promoting evidence

#### Scenario: Pre-trust project history is opened
- **WHEN** a project conversation predates the server trust marker
- **THEN** the server refuses to continue it and requires a new project conversation

### Requirement: Read-only legacy history
The system SHALL expose prior embedded diligence Q&A as bounded read-only history and SHALL NOT imply that it can be continued as the same conversation.

#### Scenario: User opens legacy history
- **WHEN** the user selects preserved legacy Q&A
- **THEN** the messages are displayed with a read-only label, the input is disabled, and an explicit new-project-conversation action is offered

### Requirement: Evidence-grounded answers and citations
The system SHALL reuse the diligence evidence answer path, validate every document citation against the current project's citable documents, and treat documents, CRM notes, and stored content as untrusted data rather than instructions.

#### Scenario: Model invents a document identifier
- **WHEN** the model returns a citation not present in the project's citable document set
- **THEN** the system omits that citation from the response and stored history

#### Scenario: Relationship permission is absent
- **WHEN** a user has diligence read access but lacks either relationships interactions or notes access
- **THEN** the project answer path does not load or expose the user's Affinity credential or CRM tools

#### Scenario: Affinity project binding is present
- **WHEN** CRM tools are available for a project answer
- **THEN** the credential belongs to the exact Fund and notes/files calls can target only the Affinity organization linked to that project

### Requirement: Conservative derived-evidence provenance
The system MAY archive a successfully persisted, data-room-grounded Assistant answer, but it MUST mark it as assistant-derived, unverified, and excluded from evaluation until a user explicitly includes it.

#### Scenario: Eligible answer is archived
- **WHEN** a diligence writer receives a cited project answer, the private conversation persists, and no CRM tool was used
- **THEN** the archived record retains requester, conversation, model, generation time, and document citations and remains excluded from Q&A context, memo, and scoring

#### Scenario: CRM contributes to an answer
- **WHEN** an answer used an Affinity lookup without auditable note-level provenance
- **THEN** the system keeps it in private conversation history and does not archive it as shared evidence

### Requirement: Atomic and server-only evidence mutation
The system MUST route all Q&A evidence append, AI/Partner session append, completion, include/exclude, and delete operations through bounded service-role-only database functions that lock the exact target row. QA session records MUST be unavailable through the browser Data API. Every Q&A lifecycle route MUST recheck live diligence write access and exact Fund/deal/draft/session scope.

#### Scenario: Concurrent stage completion and Assistant archive
- **WHEN** memo-agent QA completion and an Assistant evidence append execute concurrently
- **THEN** both session-owned and externally authored records remain in the draft without lost updates

#### Scenario: Partners answer concurrently
- **WHEN** two authorized users submit answer batches to the same Fund/deal/session
- **THEN** both batches append atomically and neither silently overwrites the other

#### Scenario: Two next-batch requests overlap
- **WHEN** two model calls derive a next batch from the same session message version
- **THEN** only the first result appends and the stale result returns a retryable conflict without duplicating questions

#### Scenario: Two users start Q&A concurrently
- **WHEN** two authorized users start Q&A for the same Fund, project, and live draft at the same time
- **THEN** the database serializes creation and both callers receive the same active QA session

#### Scenario: A project receives a new memo draft
- **WHEN** Q&A starts for a new live draft after an earlier draft already has a session
- **THEN** the new draft receives its own session and append, state, and completion operations reject the earlier draft's session without advancing the project stage

#### Scenario: Browser attempts to mutate a QA session directly
- **WHEN** an authenticated Fund member bypasses the server routes and addresses the QA session table through the Data API
- **THEN** table privileges deny the request before session history or mutable state is exposed

#### Scenario: Answer races with completion
- **WHEN** an authorized Partner answer and QA completion target the same active session concurrently
- **THEN** the answer is either included before the session atomically completes or rejected after closure, and is never acknowledged then omitted

#### Scenario: Session belongs to another project
- **WHEN** a user submits a session or draft identifier that does not belong to the URL project and current Fund
- **THEN** the operation fails without reading, writing, or advancing either project

#### Scenario: Diligence write access is revoked
- **WHEN** a Fund member without current diligence write access invokes a Q&A lifecycle route
- **THEN** the route returns forbidden before reading draft context, invoking the model, or mutating session state

#### Scenario: Q&A request is oversized
- **WHEN** a Q&A endpoint receives an oversized declared or chunked request, including multi-byte text
- **THEN** it stops reading at the byte limit and returns a bounded client error before any database write

### Requirement: Safe Assistant rendering and failure disclosure
The system MUST block passive remote content in Assistant Markdown and SHALL disclose when a generated answer could not be saved to history.

#### Scenario: Assistant returns a Markdown image or unsafe link
- **WHEN** the response contains an image or a link outside HTTP(S)/mailto
- **THEN** the image is not requested and the unsafe link is rendered without navigation

#### Scenario: Conversation write fails
- **WHEN** model generation succeeds but conversation persistence fails
- **THEN** the answer remains visible with an unsaved-history warning and is not promoted to shared evidence
