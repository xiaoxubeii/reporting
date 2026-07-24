## ADDED Requirements

### Requirement: Separate persistent process entrypoints
The system SHALL provide one production command for the persistent Next.js Node server and one independent production command for the persistent Croner scheduler, without registering schedules inside the Web process.

#### Scenario: Production process supervisor starts Reporting
- **WHEN** an operator starts the documented Web and Cron commands
- **THEN** the existing Next.js application serves its routes and exactly one independent Cron process registers recurring jobs

### Requirement: Schedule parity
The Cron service SHALL register the five existing recurring jobs using UTC and the same route paths and cron expressions formerly declared in `vercel.json`.

#### Scenario: Runner starts with valid configuration
- **WHEN** the Cron process validates its production configuration
- **THEN** it registers deals digest at `0 13 * * 1`, memo agent worker at `*/3 * * * *`, Affinity sync at `0 * * * *`, deal research at `*/10 * * * *`, and Heartbeat backfill at `0 * * * *`

### Requirement: Authenticated bounded invocation
The Cron service SHALL invoke each route with HTTP GET, the existing bearer secret, redirect rejection, and a bounded request timeout without exposing secret material in logs or health responses.

#### Scenario: Scheduled route succeeds
- **WHEN** a registered job invokes a route that returns a 2xx response before its timeout
- **THEN** the runner records a successful completion containing the job name, status code, and duration but no authorization value or response body

#### Scenario: Scheduled route fails or redirects
- **WHEN** a route times out, rejects the connection, redirects, or returns a non-2xx response
- **THEN** the runner records a failed completion without leaking the bearer secret and remains available for later schedules

### Requirement: Safe configuration validation
The Cron service MUST reject missing or shorter-than-32-character production secrets, destination URLs with credentials or non-origin components, unsafe production HTTP destinations without explicit opt-in, and invalid numeric lifecycle settings before registering any schedule.

#### Scenario: Invalid production destination
- **WHEN** production configuration uses a plain HTTP destination without the explicit private-network opt-in
- **THEN** startup exits unsuccessfully before any Croner job or health listener is registered

### Requirement: Per-process overlap protection
The Cron service SHALL prevent a second occurrence of the same job from starting while its previous asynchronous invocation remains active in that process.

#### Scenario: Schedule fires while its prior invocation is active
- **WHEN** Croner reaches the same job schedule before the prior Promise settles
- **THEN** the second occurrence is skipped and a secret-free protected-overrun event is logged

### Requirement: Health and graceful shutdown
The Cron service SHALL expose minimal liveness and readiness responses and SHALL stop future schedules, close health listeners, and bound the wait for active requests when it receives SIGTERM or SIGINT.

#### Scenario: Health request target is malformed
- **WHEN** an unauthenticated health request contains a request target that cannot be parsed as a URL
- **THEN** the health listener returns HTTP 400 without evaluating readiness or terminating the Cron process

#### Scenario: Supervisor terminates the Cron process
- **WHEN** the process receives SIGTERM while one or more requests are active
- **THEN** no new invocation starts, health readiness is removed, active requests receive the configured grace period, and remaining requests are aborted before process exit

### Requirement: Real one-shot verification path
The Cron entrypoint SHALL provide a one-shot mode that invokes one named manifest job through the same validation, URL construction, authorization, timeout, logging, and result handling used by recurring execution.

#### Scenario: Operator verifies a deployment
- **WHEN** an operator starts the Cron entrypoint with a valid one-shot job name
- **THEN** exactly that route is invoked once and the process exits successfully only after a 2xx response

### Requirement: Explicit durability boundary
The production documentation MUST state that Croner is an in-memory scheduler, requires exactly one Cron replica and an external restart supervisor, does not backfill missed occurrences, and does not replace existing database-backed domain job state.

#### Scenario: Operator reviews deployment requirements
- **WHEN** the Cron service is prepared for production deployment
- **THEN** the documented topology distinguishes Web scaling from the single Cron replica and identifies existing domain tables as the source of truth for pending work
