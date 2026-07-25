## ADDED Requirements

### Requirement: Unified local lifecycle command
The system SHALL provide an executable root `devctl.sh` command that manages the repository-owned Web, Croner, Miniflux, and SearXNG runtime units with `start`, `stop`, `restart`, `status`, and `logs` actions.

#### Scenario: Start all services by default
- **WHEN** a developer runs `./devctl.sh start` without service names
- **THEN** the system starts Miniflux, SearXNG, Web, and Croner in dependency order and waits for each unit to become ready

#### Scenario: Manage a selected service subset
- **WHEN** a developer supplies one or more supported service names
- **THEN** the system applies the action only to that subset while preserving the shared runtime state

#### Scenario: Reject an unsupported command or service
- **WHEN** a developer supplies an unknown action, unknown service, or malformed option
- **THEN** the command exits non-zero with concise usage guidance and starts or stops nothing

### Requirement: Ten-port block allocation
The system SHALL reserve a complete ten-port block beginning at port 5000 by default, map Web to base `+0`, Cron health to `+1`, Miniflux to `+2`, and SearXNG to `+3`, and persist the selected mapping.

#### Scenario: Default block is free
- **WHEN** every port from 5000 through 5009 can be bound on loopback
- **THEN** the system selects base 5000 and publishes ports 5000, 5001, 5002, and 5003 to the four managed units

#### Scenario: Any port in a block is occupied
- **WHEN** one or more ports in 5000 through 5009 are unavailable
- **THEN** the system rejects that entire block and probes 5010 through 5019, continuing in increments of 10 until a full block is free

#### Scenario: No complete block remains
- **WHEN** the configured search range cannot contain a complete free ten-port block
- **THEN** start fails before creating any service and explains that no port block is available

#### Scenario: Existing runtime reuses its block
- **WHEN** valid runtime state already records a selected block
- **THEN** later status, stop, or incremental start actions reuse that block rather than scanning for a different one

### Requirement: Safe process and Compose ownership
The system MUST stop only Node process groups and Compose projects whose ownership is recorded and revalidated for this checkout's devctl runtime.

#### Scenario: PID identity is valid
- **WHEN** a recorded Web or Cron PID, start time, process group, and command fingerprint still match
- **THEN** stop sends `SIGTERM` to that owned process group, waits a bounded grace period, and uses `SIGKILL` only if the same owned group remains alive

#### Scenario: PID is stale or reused
- **WHEN** a recorded PID is missing, malformed, or belongs to a process whose identity no longer matches
- **THEN** the system marks the record stale, removes it safely, and sends no signal to that PID or its group

#### Scenario: Another worktree has Compose services
- **WHEN** Miniflux or SearXNG containers exist under a different Compose project name
- **THEN** devctl neither recreates nor stops those containers and uses its checkout-specific project name

#### Scenario: Stop preserves data
- **WHEN** devctl stops its Compose projects
- **THEN** it removes the running containers without deleting their named volumes

### Requirement: Transactional and idempotent lifecycle
The system SHALL make repeated lifecycle commands safe and SHALL roll back only resources created by a failed start invocation.

#### Scenario: Start an already-running runtime
- **WHEN** all selected units are already healthy and owned
- **THEN** start exits successfully, reports them as already running, and does not create duplicate processes or containers

#### Scenario: Stop an already-stopped runtime
- **WHEN** none of the selected units is owned and running
- **THEN** stop exits successfully and reports them as already stopped

#### Scenario: Later service fails readiness
- **WHEN** one unit fails to start or become ready after earlier units were created in the same invocation
- **THEN** the system stops only those newly created units in reverse order, preserves pre-existing units, and leaves no valid partial state

#### Scenario: Concurrent lifecycle commands
- **WHEN** two mutating devctl commands run concurrently for the same runtime directory
- **THEN** at most one command acquires the lifecycle lock and the other exits without mutating services or state

### Requirement: Accurate status and logs
The system SHALL report per-unit lifecycle state, selected ports, applicable PIDs, log paths, and the external Supabase dependency without exposing secrets.

#### Scenario: All managed units are healthy
- **WHEN** process identity, listening ports, HTTP readiness, and Compose health checks all pass
- **THEN** status labels every managed unit `running`, prints the selected base block, and exits successfully

#### Scenario: Runtime is partially healthy
- **WHEN** one or more selected units fail identity or readiness checks while others remain healthy
- **THEN** status labels each unit accurately, reports the aggregate runtime as `degraded`, and exits non-zero

#### Scenario: Runtime is stopped
- **WHEN** no valid owned unit is running
- **THEN** status reports `stopped` without treating unrelated listeners as owned services

#### Scenario: Supabase is external
- **WHEN** status inspects the configured Supabase endpoint
- **THEN** it reports the endpoint as an external dependency and never offers or performs a Supabase start or stop action

#### Scenario: Read service logs
- **WHEN** a developer runs the logs action for all or selected services
- **THEN** devctl reads only the corresponding files under its runtime log directory and redacts no secret because secrets were never written there

### Requirement: Protected runtime configuration
The system MUST keep runtime metadata and generated development secrets out of source control and MUST NOT execute `.env.local` as shell code.

#### Scenario: Runtime directory is created
- **WHEN** devctl first needs local state
- **THEN** it creates an ignored mode-0700 runtime directory, mode-0600 state and secret files, and contains no plaintext secret in public state

#### Scenario: Existing environment secrets are absent
- **WHEN** Croner or SearXNG requires a local secret that is not set in the inherited environment
- **THEN** devctl generates a cryptographically random secret, persists it only in the protected secret directory, and injects it into the relevant child environment

#### Scenario: Environment file contains shell syntax
- **WHEN** `.env.local` includes characters meaningful to a shell
- **THEN** devctl passes the file only to parsers that understand dotenv syntax and never sources or evaluates it
