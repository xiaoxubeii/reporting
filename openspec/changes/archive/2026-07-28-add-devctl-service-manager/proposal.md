## Why

Local development currently requires separate commands for the Next.js web process, Croner scheduler, Miniflux, SearXNG, and (when configured locally) Supabase. Developers need one safe entrypoint that allocates a conflict-free local port block and reports or tears down exactly the processes it owns.

## What Changes

- Add an executable root `devctl.sh` entrypoint with `start`, `stop`, `restart`, `status`, and `logs` commands.
- Start and supervise the Reporting web and Croner processes, plus the project-owned Miniflux and SearXNG Compose services; manage Supabase when the configured Supabase URL is local.
- Allocate Web, Cron health, Miniflux, and SearXNG from one four-port block beginning at 5000; if any required port is unavailable, retry the whole block at 5010, 5020, and so on.
- Persist non-secret runtime metadata, PID identity, selected ports, and logs under an ignored `.devctl/` directory.
- Make repeated start/stop operations safe, reject stale or foreign PID ownership, and roll back services started by a failed start.
- Add black-box tests for port selection, lifecycle idempotency, stale state, status, and cleanup without starting real infrastructure.

## Capabilities

### New Capabilities

- `local-service-control`: Defines the unified local service lifecycle, port-block allocation, ownership, status, logging, and failure-recovery contract.

### Modified Capabilities

None.

## Impact

- Adds `devctl.sh`, a focused implementation under `scripts/devctl/`, and lifecycle tests under `tests/`.
- Integrates existing `npm run dev`, `npm run cron:start`, `scripts/miniflux-local.sh`, `compose.searxng.yml`, and Supabase CLI entrypoints without changing their production contracts.
- Uses existing Node.js, npm, Docker Compose, and optional Supabase CLI dependencies; no new package dependency or public API is introduced.
