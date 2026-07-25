## 1. Planning and Contracts

- [x] 1.1 Register the unified local service manager in OpenSpec and HarnessKit with explicit ownership and port-block boundaries
- [x] 1.2 Add focused failing tests for ten-port allocation, lifecycle idempotency, stale state, rollback, and safe cleanup

## 2. Port and Runtime State

- [x] 2.1 Implement complete ten-port block probing from 5000 with configurable base and +10 fallback
- [x] 2.2 Implement protected runtime directories, atomic non-secret JSON state, generated secret files, and lifecycle locking
- [x] 2.3 Implement PID/process-group identity validation that never signals stale or foreign processes

## 3. Service Lifecycle

- [x] 3.1 Implement Web and Cron start/readiness/stop/log handling with a shared dynamic base URL and Cron secret
- [x] 3.2 Implement isolated Miniflux and SearXNG Compose lifecycle with checkout-specific project ownership and no volume deletion
- [x] 3.3 Implement aggregate start, stop, restart, status, logs, subset selection, transactional rollback, and external Supabase reporting

## 4. Entry Point and Documentation

- [x] 4.1 Add executable root `devctl.sh`, ignore `.devctl/`, and document commands, port mapping, dependencies, and runtime files
- [x] 4.2 Keep existing production and standalone service entrypoints compatible

## 5. Verification and Handoff

- [x] 5.1 Pass focused lifecycle tests, shell syntax, changed-scope checks, strict OpenSpec validation, and HarnessKit fast; run targeted verification and record unrelated blockers
- [x] 5.2 Run the real CLI start/status/repeated-start/stop/repeated-stop/status path without touching the shared Supabase stack
- [x] 5.3 Complete code and security review, resolve in-scope findings, and record final verification evidence
