## ADDED Requirements

### Requirement: Durable background actor attribution
The system SHALL persist every generic background job with a validated kind and payload, fund, actor type, actor user when applicable, dedupe key, lifecycle, attempt, lease, retry, and audit timestamps in a service-owned store and SHALL persist attempt-bound tool-call idempotency records separately.

#### Scenario: User job is created from a Session
- **WHEN** an authenticated user requests a supported background action
- **THEN** the server SHALL derive the actor user and fund from the authenticated Session and current access context rather than request input
- **AND** the persisted job SHALL identify `actor_type = user` and that user id

#### Scenario: Automatic job is system-owned
- **WHEN** an automatic workflow enqueues work without an initiating user
- **THEN** the persisted job SHALL identify `actor_type = system` with no actor user id
- **AND** the job SHALL not inherit or select an administrator or fund member as a proxy

#### Scenario: Browser attempts to alter a job actor
- **WHEN** a browser or authenticated database client attempts to insert or update a background job directly
- **THEN** RLS and grants SHALL deny the operation

### Requirement: Scheduler authentication is separate from job delegation
The system SHALL use `CRON_SECRET` only to authenticate Croner at the dispatcher and SHALL use a distinct short-lived Job Token for downstream HTTP requests.

#### Scenario: Croner invokes the dispatcher
- **WHEN** the dispatcher receives the exact configured Cron bearer secret
- **THEN** it MAY claim and dispatch due jobs
- **AND** it SHALL never forward that secret to a worker

#### Scenario: Missing or incorrect Cron secret
- **WHEN** the dispatcher lacks a configured secret or receives a non-matching bearer value
- **THEN** it SHALL fail closed without claiming work or disclosing the configured value

### Requirement: Attempt-scoped, per-hop Job Tokens
The system SHALL sign each Job Token with a dedicated server secret of at least 32 random bytes and claims limited to a fixed type, trusted issuer, one exact hop audience, job id, attempt id, unique token id, not-before/issued time, and expiry no later than the active lease.

#### Scenario: Valid current attempt
- **WHEN** a receiver verifies a correctly signed, unexpired token for a currently running job attempt
- **THEN** it SHALL use the job id and attempt id to restore context from the service-owned job row

#### Scenario: Expired, malformed, or wrong-audience token
- **WHEN** token signature, algorithm, format, issuer, audience, issued time, or expiration validation fails
- **THEN** the receiver SHALL return an authentication failure and perform no business action

#### Scenario: Superseded or completed attempt
- **WHEN** a validly signed token references an attempt that is no longer the job's active running attempt
- **THEN** the receiver SHALL reject it even when its cryptographic expiry has not elapsed

#### Scenario: Worker token is presented to Search
- **WHEN** a valid Deal Research worker-audience token is presented to `/api/search`
- **THEN** Search SHALL reject it for wrong audience without falling back to Session authentication

#### Scenario: Search tool call retry
- **WHEN** the same Search-audience token and tool call id are retried with the identical bounded request hash during the active attempt
- **THEN** the system SHALL return the persisted bounded result without executing Search again

#### Scenario: Tool call id is reused with different input
- **WHEN** the same job, attempt, and tool call id are presented with a different request hash
- **THEN** the system SHALL reject the request as a replay or conflict

### Requirement: Live HTTP execution-context restoration
Every background-capable HTTP endpoint SHALL independently restore an immutable `BackgroundExecutionContext` and SHALL live-authorize it for the requested route scope.

#### Scenario: Context crosses a process boundary
- **WHEN** one background execution stage invokes another stage
- **THEN** it SHALL use an authenticated HTTP request and the receiver SHALL restore context from the Job Token and live database row
- **AND** the system SHALL not pass an in-memory execution context between stages

#### Scenario: Current user membership and access
- **WHEN** a user job calls a permitted HTTP endpoint
- **THEN** the receiver SHALL reload the job, membership, fund, role, feature access, kind policy, payload, attempt, and lease
- **AND** it SHALL return a context only when all values are mutually consistent

#### Scenario: Membership or feature access revoked
- **WHEN** the actor no longer belongs to the job fund or no longer has required access
- **THEN** the next worker or Search HTTP call SHALL fail closed without service-role bypass

#### Scenario: Caller supplies identity fields
- **WHEN** a request body or URL includes a user id, fund id, actor, scope, adapter, endpoint, or destination not required by the route contract
- **THEN** the receiver SHALL ignore or reject those fields and SHALL not use them to construct execution context

#### Scenario: System actor requests personal data
- **WHEN** a system job invokes Search or another user-scoped service
- **THEN** the receiver SHALL restrict it to the job kind's system scopes and SHALL not load personal Feed credentials or state

### Requirement: Code-owned job-kind policy
The system SHALL map each supported job kind to a schema validator, fixed same-origin worker path, actor policy, allowed route scopes, lease, timeout, and retry limit in immutable server code.

#### Scenario: Registered kind is dispatched
- **WHEN** a claimed job has a registered kind and valid payload
- **THEN** the dispatcher SHALL call only that kind's configured worker path using the validated server-only internal origin

#### Scenario: Multiple kinds are registered
- **WHEN** the code-owned registry contains more than one job kind
- **THEN** the generic dispatcher SHALL atomically claim due work across the registered kind set under one global batch and concurrency bound
- **AND** adding the kind SHALL not require a Deal-specific branch in the dispatcher, token verifier, or context-restoration core

#### Scenario: Untrusted origin hints are supplied
- **WHEN** request Host or forwarded headers, public environment values, job data, or model input contain a different origin
- **THEN** the dispatcher and tool executor SHALL ignore them and SHALL use only the validated server-only internal origin

#### Scenario: Unknown kind or invalid payload
- **WHEN** a job kind is unknown or its payload fails validation
- **THEN** the job SHALL fail without making an outbound request

#### Scenario: Redirect or arbitrary destination
- **WHEN** a worker response redirects or job data contains a URL-like destination
- **THEN** the dispatcher SHALL reject the redirect and SHALL never use job data as an HTTP destination

### Requirement: Atomic claim, retry, dedupe, and finalization
The job store SHALL prevent concurrent claims and stale writeback through database locking, unique active dedupe keys, attempt ids, leases, bounded retries, and compare-and-set terminal transitions.

#### Scenario: Concurrent dispatchers
- **WHEN** multiple dispatchers scan the same pending job
- **THEN** at most one SHALL receive a running attempt for that job

#### Scenario: Duplicate active enqueue
- **WHEN** the same dedupe key is enqueued while a pending or running job exists
- **THEN** the system SHALL return the existing job without creating another active execution

#### Scenario: Worker times out
- **WHEN** a network timeout or retryable server failure occurs before the attempt lease expires
- **THEN** the dispatcher SHALL requeue with bounded backoff and a new attempt on the next claim until the retry limit

#### Scenario: External provider charged before crash
- **WHEN** an attempt crashes after external work completes but before durable finalization
- **THEN** a later attempt MAY repeat billable work under at-least-once execution
- **AND** attempt fencing SHALL still prevent stale results from overwriting the newer attempt

#### Scenario: Old worker writes after retry
- **WHEN** an old attempt returns after a newer attempt has been claimed
- **THEN** its finalization SHALL affect zero rows and SHALL not overwrite the newer attempt or domain result

### Requirement: Secret and audit hygiene
The system SHALL keep Cron and Job Token secrets server-only and SHALL record bounded execution metadata without credentials, bearer values, personal Feed contents, or model queries.

#### Scenario: Structured execution logging
- **WHEN** a job is claimed, dispatched, retried, or finalized
- **THEN** logs SHALL include only identifiers, kind, route label, outcome, duration, and bounded counts needed for operations
- **AND** logs SHALL omit authorization headers and token payloads
