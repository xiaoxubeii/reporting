## ADDED Requirements

### Requirement: Create a confirmed expert validation request
The system SHALL allow an authorized fund member to create an expert validation request from a Research gap or contradiction. The request SHALL persist a snapshot of the selected source, one focused sanitized question, one desired expert profile, and one sanitized context snapshot without modifying `research_output`. The system SHALL allow the member to edit and confirm generated values and to enter them manually if generation fails.

#### Scenario: Create from a Research gap
- **WHEN** an authorized fund member starts expert validation from a Research gap and confirms the question, expert profile, and context
- **THEN** the system creates a deal- and fund-scoped request in `draft` status, records the source draft, source kind, source array index, and source snapshot, and leaves `research_output` unchanged

#### Scenario: Create from a contradiction
- **WHEN** an authorized fund member starts expert validation from a contradiction and confirms the question, expert profile, and context
- **THEN** the system creates the same request shape with `source_kind = 'contradiction'` and preserves the contradiction snapshot even if a later Research run overwrites the array

#### Scenario: Generation fails
- **WHEN** the configured AI provider cannot generate a question, expert profile, or sanitized context
- **THEN** the system creates no partial request and allows the authorized member to enter and confirm the three values manually

#### Scenario: Reject invalid request input
- **WHEN** a required value is missing or exceeds its configured input limit
- **THEN** the system rejects the request without creating a partial record

### Requirement: Maintain a server-mediated expert directory
The system SHALL store expert entries inside the existing Supabase/Postgres boundary. Each expert SHALL be global or private to one fund and SHALL contain the minimum profile and contact data required for manual selection and semantic matching. Authenticated clients SHALL NOT receive direct table access to global contact data.

#### Scenario: Read eligible directory entries
- **WHEN** an authorized fund member opens the expert directory
- **THEN** a server-side API returns active global experts and experts private to that member's fund without returning experts private to another fund or exposing expert email addresses

#### Scenario: Use contact data for invitation
- **WHEN** an authorized member confirms an eligible expert and issues an invitation
- **THEN** the server reads the email only for that operation and does not include it in directory or automatic-match DTOs

#### Scenario: Expert has no embedding
- **WHEN** an otherwise eligible expert has no embedding
- **THEN** the expert remains available for manual selection and is excluded from automatic matching

### Requirement: Support manual and automatic expert selection
The system SHALL allow an authorized fund member to search eligible experts manually or request semantic candidates using the confirmed sanitized validation question plus desired expert profile. Both paths SHALL require the member to confirm exactly one expert before invitation.

#### Scenario: Select an expert manually
- **WHEN** an authorized fund member searches the eligible directory and confirms one expert
- **THEN** the system stores that expert, `selection_method = 'manual'`, and an identity/profile snapshot without granting the expert reporting access

#### Scenario: Return automatic matches
- **WHEN** an authorized fund member requests automatic matching for a request with a confirmed question and expert profile
- **THEN** the system filters to active, contactable global or same-fund experts with embeddings, orders them by exact cosine similarity, and returns at most five redacted candidates without selecting or inviting one

#### Scenario: Confirm an automatic match
- **WHEN** an authorized fund member confirms one returned candidate
- **THEN** the system stores that expert, `selection_method = 'auto_match'`, and an identity/profile snapshot without persisting unselected candidates or a matching run

#### Scenario: Do not invite before confirmation
- **WHEN** automatic matching returns candidates but no authorized fund member confirms one
- **THEN** the system does not bind a candidate and does not send an invitation

### Requirement: Keep vector retrieval minimal and fixed-model
The system SHALL use `pgvector` in the existing Supabase/Postgres database for exact similarity search. The first version SHALL use one deployment-configured embedding model and vector dimension and SHALL NOT require a separate vector database, approximate vector index, LLM query planner, LLM reranker, runtime model migration, or cross-model comparison.

#### Scenario: Generate an expert embedding
- **WHEN** an expert profile is created or its `profile_text` changes
- **THEN** the server uses the fixed configured embedding model, stores the embedding and model identifier, and excludes contact fields from the embedded text

#### Scenario: Match without disclosing context
- **WHEN** automatic matching generates a query embedding
- **THEN** it uses the confirmed sanitized question and desired expert profile and does not send the context snapshot, Deal name, source object, or expert contact data to the embedding provider

#### Scenario: Embedding generation fails
- **WHEN** the embedding provider fails for an expert or query
- **THEN** the system keeps manual search available and does not create an automatic matching result

### Requirement: Issue an invitation with least-privilege access
The system SHALL allow an authorized fund member to issue an invitation only after confirming one expert, the question, and the sanitized context. The server SHALL create a 32-byte random expiring bearer token, persist only its SHA-256 hash, place the plaintext token in the response URL fragment, and scope it to one request. `invited` SHALL mean credential issued, not email delivered.

#### Scenario: Issue and send an invitation
- **WHEN** an authorized fund member sends an invitation for a confirmed draft request
- **THEN** one conditional `draft` to `invited` update freezes the disclosed snapshots, only the winning caller may send the corresponding link, the email omits Deal-sensitive question and context, and the plaintext URL is returned only in that issuance response

#### Scenario: Email provider accepts the message
- **WHEN** the configured provider accepts an invitation message
- **THEN** the system records the provider acceptance time and message ID without claiming final delivery

#### Scenario: Email provider fails
- **WHEN** the provider returns an error after token issuance
- **THEN** the system keeps the issued token valid, stores only a sanitized bounded error code/message without token or request body, and lets the authorized caller use the one-time returned Copy link or reissue a replacement

#### Scenario: Reissue an invitation
- **WHEN** an authorized member reissues an invited, unsubmitted request
- **THEN** a conditional update replaces the current token hash and expiry, only the winning concurrent caller may send its link, and the confirmed question and context remain unchanged

#### Scenario: Invitation reaches expiry
- **WHEN** an invitation reaches its expiry without submission
- **THEN** token-scoped access is rejected; the first version does not provide a separate revoke or cancel operation

### Requirement: Isolate the public bearer response surface
The system SHALL provide a public response route without an account, session, analytics, third-party scripts, or cacheable sensitive responses. The route SHALL remove the fragment token synchronously before other application scripts run and retain it only in page memory.

#### Scenario: Open a valid invitation
- **WHEN** an expert opens a valid unexpired invitation token
- **THEN** the page runs under a restrictive route-specific CSP, removes the fragment before other application code, and the API returns only the invitation party, deadline, question, response instructions, and sanitized context

#### Scenario: Prevent caching and telemetry leakage
- **WHEN** the public page or token-scoped resolve/submit API responds
- **THEN** it returns no-store browser and CDN cache headers and neither the raw token nor invitation URL is written to analytics, logs, telemetry, cookies, local storage, or session storage

#### Scenario: Apply token rate limiting
- **WHEN** a public resolve or submit request is rate limited by token
- **THEN** the limiter uses only the token hash or an HMAC-derived key and never persists the plaintext token

#### Scenario: Reject invalid invitation access
- **WHEN** a token is invalid, expired, rotated, or outside its allowed request state
- **THEN** the API returns a generic non-enumerating error without revealing the request, Deal, fund, or expert identity

### Requirement: Submit once and automatically materialize evidence
The system SHALL collect one bounded text response directly on the expert request without drafts, attachments, email-reply parsing, a session cookie, a separate response table, a submission receipt, or an internal Accept/Reject step. A successful submission SHALL automatically start idempotent materialization as one `industry_expert` document.

#### Scenario: Expert submits a response
- **WHEN** an invited expert submits a valid bounded response with an unexpired token
- **THEN** one atomic conditional update stores `response_markdown` and `submitted_at`, moves the request from `invited` to `submitted`, locks the response against changes, and invokes the evidence materializer

#### Scenario: Duplicate submission attempt
- **WHEN** the same token is retried after a successful submission
- **THEN** the system does not replace or expose the original response, returns only a generic already-submitted result and submission time, and may retry missing materialization steps idempotently

#### Scenario: Materialize the submitted response
- **WHEN** a submitted response has no fully linked evidence document
- **THEN** the system writes one immutable Markdown artifact to the deterministic private path, creates or reuses one Diligence document with `detected_type = 'industry_expert'`, `type_confidence = 'high'`, and `parse_status = 'pending'`, links it to the request, and invokes `enqueueIngestForDocuments`

#### Scenario: Recover partial materialization
- **WHEN** submission or an authorized internal retry runs after the storage object, document row, request link, or enqueue attempt was only partially completed
- **THEN** the system reuses existing artifacts, completes only missing steps, does not overwrite the expert artifact, skips enqueue when the document is already parsed, and otherwise relies on the existing enqueue helper and document state

#### Scenario: Another Deal job is active
- **WHEN** materialization invokes the existing enqueue helper while another job is active for the Deal
- **THEN** the document remains visibly pending, the system does not claim automatic continuation, and an authorized member may later use the existing Data Room `Process` or `Analyze data room` action

### Requirement: Treat expert responses as untrusted AI input
The system SHALL preserve the expert's original response in the evidence artifact while preventing document content from being interpreted as instructions by the Ingest model.

#### Scenario: Response contains prompt-like instructions
- **WHEN** a submitted response contains closing delimiters, role instructions, or requests to ignore system rules
- **THEN** the Ingest prompt places it inside a non-breakable data boundary and instructs the model to treat all document commands as evidence text rather than executable instructions

### Requirement: Reuse the existing evidence and Research pipeline
The system SHALL process the expert document through the existing explicit-document Ingest merge, synthesis, and checklist flow and SHALL preserve the current complete Research rerun behavior. The first version SHALL NOT add an expert worker kind, expert-specific Research output, automatic Research run, or expert-evidence freshness calculation.

#### Scenario: Incremental Ingest succeeds
- **WHEN** the expert document is processed by Ingest
- **THEN** its parsed result is merged with existing ingestion documents and the existing synthesis and checklist follow-ups are enqueued

#### Scenario: User reruns Research
- **WHEN** an authorized member uses the existing Research action after expert evidence has been Ingested
- **THEN** Claims verification reads all current Ingest documents, the existing competitors and founders filters remain unchanged, and the pipeline overwrites the current draft's single `research_output`

#### Scenario: Do not infer Research freshness
- **WHEN** an expert document is submitted or parsed
- **THEN** the first version does not derive or display whether Research includes that material and does not create a Research version or expert-specific result

### Requirement: Keep expert validation independent of Attention and Q&A
The system SHALL use the expert request and linked document as the only expert-validation state and SHALL NOT create Diligence Attention items or Q&A messages to mirror it.

#### Scenario: Expert request status changes
- **WHEN** a request moves through creation, invitation, or submission
- **THEN** the system updates the request and linked document only and does not create or synchronize an Attention item, Q&A message, LP identity, or fund membership
