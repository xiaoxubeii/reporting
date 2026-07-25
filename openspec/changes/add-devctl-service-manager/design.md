## Context

Reporting has four repository-owned local runtime units with different lifecycle models: Next.js Web and Croner are long-running Node processes, while Miniflux and SearXNG are Docker Compose projects. The configured Supabase endpoint is a shared stack outside this repository, so this change must report its reachability without taking ownership of it. Existing Miniflux/SearXNG Compose names can also be shared across worktrees, making ownership isolation essential.

## Goals / Non-Goals

**Goals:**

- Provide one root CLI for starting, stopping, restarting, inspecting, and reading logs for every repository-owned local runtime unit.
- Allocate one conflict-free ten-port block starting at 5000 and persist the choice for later commands.
- Stop only processes and Compose projects created by this checkout's devctl runtime.
- Keep runtime secrets out of source control, state output, command output, and logs.
- Make partial startup transactional and repeated lifecycle commands idempotent.

**Non-Goals:**

- Starting, stopping, reconfiguring, or migrating the external/shared Supabase stack.
- Replacing production process supervision or deployment definitions.
- Deleting Docker volumes on stop.
- Managing unrelated processes merely because they occupy a selected port.

## Decisions

### Use a shell entrypoint with a Node.js lifecycle implementation

`devctl.sh` remains the discoverable executable entrypoint and delegates to an ES module under `scripts/devctl/`. Node provides portable TCP probing, atomic JSON state handling, child process groups, HTTP readiness checks, and testable pure functions without adding a dependency. A large Bash-only implementation was rejected because safe JSON parsing, PID reuse protection, and cross-platform port probing become brittle.

### Reserve a complete ten-port block

The allocator tests every port in `[base, base + 9]`, beginning at `DEVCTL_BASE_PORT` or 5000. Any conflict advances the whole candidate by 10. Web uses `+0`, Cron health `+1`, Miniflux `+2`, and SearXNG `+3`; `+4..+9` are reserved for future local services. The selected base and mapping are written once and reused by `status`, incremental `start`, and `stop`.

### Isolate Docker ownership by Compose project name

Each runtime uses a deterministic checkout-local Compose project identifier derived from the selected base and repository path. devctl passes that project name to Miniflux and SearXNG so it never recreates or tears down containers owned by another worktree or an ambient developer session. `stop` runs `down` without `--volumes` only for projects recorded in valid state.

### Treat Supabase as an observed external dependency

devctl reads the configured public Supabase URL without sourcing `.env.local`, probes it for `status`, and labels it `external`. It never runs `supabase start` or `supabase stop`. This preserves the shared `/home/ubuntu/services/reporting-supabase/docker` stack currently used by this checkout.

### Persist verified ownership, not just PIDs

Runtime metadata lives under ignored `.devctl/` by default (or `DEVCTL_RUNTIME_DIR` for isolated tests). Process records contain the PID, Linux process start time, process-group ID, command fingerprint, port, and log path. Before signaling, devctl rechecks identity; invalid, missing, reused, or foreign PIDs are treated as stale and never killed. State is written through a mode-0600 temporary file and atomic rename inside a mode-0700 directory.

### Generate per-runtime development secrets when absent

Web and Cron receive the same 32-byte hexadecimal Cron secret; SearXNG receives a separate value. Existing environment values win, otherwise devctl creates mode-0600 files under `.devctl/secrets/`. Secrets are passed only through child environments and are never serialized into public state or logs. `.env.local` is never sourced as shell code.

### Use transactional startup and reverse-order shutdown

Startup order is Miniflux, SearXNG, Web, then Cron. Each unit must reach its authoritative readiness signal before the next begins. On failure or interruption, only resources created during that invocation are stopped. Normal shutdown uses Cron, Web, SearXNG, then Miniflux; process groups receive `SIGTERM`, a bounded grace period, and finally `SIGKILL` if still owned.

## Risks / Trade-offs

- **Docker, the external proxy network, or required secrets may be unavailable** → fail preflight with the exact missing dependency and do not leave a partial runtime.
- **A port can be claimed after allocation** → readiness failure triggers rollback; a fresh subsequent start selects a new block.
- **Linux `/proc` identity checks are not portable to every OS** → use the start-time check when available and fall back to a strict command fingerprint plus PID ownership; tests cover stale state.
- **Starting a unique Miniflux project creates a separate local database volume** → isolation is intentional; stop preserves the volume and the project name is stable for the same checkout/base.
- **Full repository verification has unrelated existing failures** → run focused lifecycle tests, shell syntax, OpenSpec strict validation, HarnessKit fast/targeted, and the real CLI path; record unrelated failures separately.

## Migration Plan

1. Add the OpenSpec contract and HarnessKit feature entry.
2. Add failing port and lifecycle tests.
3. Implement `devctl.sh` and the Node lifecycle modules.
4. Add `.devctl/` to `.gitignore` and document the CLI in README.
5. Run the real `start web cron`, `status`, repeated `start`, `stop`, repeated `stop`, and final `status` path, then verify the full default preflight without disrupting shared services.

Rollback removes the entrypoint, implementation, tests, documentation, and ignored runtime directory rule. Existing Docker volumes and the external Supabase stack remain untouched.

## Open Questions

None. The service and ownership boundaries are fixed by the current repository topology.
