## MODIFIED Requirements

### Requirement: Unified local lifecycle command
The system SHALL provide an executable root `devctl.sh` command that manages only the repository-owned Web and Cron runtime units with `start`, `stop`, `restart`, `status`, and `logs` actions, while treating Miniflux, SearXNG, and Supabase as external dependencies.

#### Scenario: Start all managed services by default
- **WHEN** a developer runs `./devctl.sh start` without service names
- **THEN** the system starts Web and Cron in dependency order, waits for readiness, and creates no Miniflux, SearXNG, or Supabase process or container

#### Scenario: Manage a selected service subset
- **WHEN** a developer supplies `web`, `cron`, or both
- **THEN** the system applies the lifecycle action only to that managed subset while preserving shared runtime state

#### Scenario: Reject an external dependency as a lifecycle target
- **WHEN** a developer supplies `miniflux`, `searxng`, `supabase`, or another unsupported service to `start`, `stop`, `restart`, or `logs`
- **THEN** the command exits non-zero with concise usage guidance and mutates no process, container, volume, or state

### Requirement: Ten-port block allocation
The system SHALL reserve a complete ten-port block beginning at port 5000 by default, map Web to base `+0` and Cron health to base `+1`, and expose the selected runtime mapping without allocating ports for external dependencies. The serialized state MAY retain unassigned `+2`/`+3` fields solely to remain readable by the preceding devctl release.

#### Scenario: Default block is free
- **WHEN** every port from 5000 through 5009 can be bound on loopback
- **THEN** the system selects base 5000 and assigns ports 5000 and 5001 only to the two managed units

#### Scenario: Any port in a block is occupied
- **WHEN** one or more ports in 5000 through 5009 are unavailable
- **THEN** the system rejects that entire block and probes 5010 through 5019, continuing in increments of 10 until a full block is free

#### Scenario: Existing runtime reuses its block
- **WHEN** valid runtime state already records a selected block
- **THEN** later status, stop, or incremental start actions reuse that block and do not derive external dependency ports from it

#### Scenario: Persist rollback-compatible state
- **WHEN** devctl writes runtime state after migration or lifecycle changes
- **THEN** the file remains readable by the preceding release, contains service records only for Web/Cron, and treats any legacy `miniflux`/`searxng` port fields as unassigned compatibility metadata

### Requirement: Safe process and external-service ownership
The system MUST stop only Web and Cron Node process groups whose ownership is recorded and revalidated for this checkout, and MUST never stop an external dependency or its container.

#### Scenario: PID identity is valid
- **WHEN** a recorded Web or Cron PID, start time, process group, and command fingerprint still match
- **THEN** stop sends `SIGTERM` to that owned process group, waits a bounded grace period, and uses `SIGKILL` only if the same owned group remains alive

#### Scenario: PID is stale or reused
- **WHEN** a recorded PID is missing, malformed, or belongs to a process whose identity no longer matches
- **THEN** the system marks the record stale, removes it safely, and sends no signal to that PID or its group

#### Scenario: Legacy state contains external Compose records
- **WHEN** runtime state from an older devctl version records Miniflux or SearXNG Compose projects
- **THEN** devctl removes those records from managed state without running Compose stop, down, recreate, or volume commands

### Requirement: Transactional and idempotent lifecycle
The system SHALL make repeated Web/Cron lifecycle commands safe, SHALL roll back only managed processes created by a failed invocation, and SHALL keep external dependency probes side-effect free.

#### Scenario: Start an already-running runtime
- **WHEN** all selected managed units are already healthy and owned
- **THEN** start exits successfully, reports them as already running, and creates no duplicate process or external container

#### Scenario: Later managed service fails readiness
- **WHEN** one managed unit fails to start or become ready after another was created in the same invocation
- **THEN** the system stops only newly created Web/Cron units in reverse order and leaves every external service untouched

#### Scenario: External dependency is unavailable
- **WHEN** a Miniflux, SearXNG, or Supabase health probe fails
- **THEN** status reports that dependency independently and Web/Cron lifecycle commands remain available

### Requirement: Accurate status and logs
The system SHALL report managed Web/Cron lifecycle state, selected ports, applicable PIDs and log paths, plus external Miniflux, SearXNG, and Supabase dependency health without exposing secrets.

#### Scenario: Managed units are healthy
- **WHEN** Web/Cron process identity, listening ports, and HTTP readiness pass
- **THEN** status labels both managed units `running`, prints the selected base block, and reports each external dependency separately as `external`

#### Scenario: External dependency is configured and healthy
- **WHEN** a bounded health request to configured Miniflux, SearXNG, or Supabase succeeds
- **THEN** status reports `running`, ownership `external`, and only the sanitized origin

#### Scenario: External dependency is unavailable or invalid
- **WHEN** an external endpoint is missing, malformed, unreachable, or returns a server failure
- **THEN** status reports the corresponding diagnostic state without starting, stopping, or reconfiguring it

#### Scenario: Read service logs
- **WHEN** a developer runs the logs action for all or selected managed services
- **THEN** devctl reads only Web/Cron files under its runtime log directory and never invokes Docker logs for external services

### Requirement: Protected runtime configuration
The system MUST keep runtime metadata and generated development secrets out of source control, MUST NOT execute `.env.local` as shell code, and MUST preserve operator-configured external service values.

#### Scenario: Runtime directory is created
- **WHEN** devctl first needs local state
- **THEN** it creates an ignored mode-0700 runtime directory and mode-0600 state/secret files containing no external service credential

#### Scenario: Child processes start
- **WHEN** devctl constructs the Web or Cron environment
- **THEN** it derives only managed Web/Cron topology and preserves configured Miniflux/SearXNG endpoints, token files, and secrets without replacing them with checkout-specific values

#### Scenario: Environment file contains shell syntax
- **WHEN** `.env.local` includes characters meaningful to a shell
- **THEN** devctl passes the file only to parsers that understand dotenv syntax and never sources or evaluates it
