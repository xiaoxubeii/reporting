## Context

The first devctl implementation treated every repository-owned component as a checkout-owned lifecycle unit. That is appropriate for Web and Cron, but not for the operator-owned Miniflux and SearXNG instances that already run continuously and preserve shared state. Checkout-specific Compose project names created a second Miniflux database and a second SearXNG process, then dynamic environment overrides redirected Web/Cron away from the configured external endpoints.

The current local environment already defines the authoritative endpoints and Miniflux token files. Supabase establishes the desired pattern: devctl probes it for status but does not own its lifecycle.

## Goals / Non-Goals

**Goals:**

- Restrict devctl lifecycle ownership and selectable services to Web and Cron.
- Probe Miniflux, SearXNG, and Supabase as immutable external dependency descriptors.
- Preserve environment-provided Miniflux/SearXNG URLs and token paths in Web/Cron child processes.
- Keep start/stop/restart idempotent and unable to mutate any external container or volume.
- Report enough endpoint and health information to diagnose missing dependencies without exposing secrets.

**Non-Goals:**

- Deleting the duplicate Compose projects or volumes already created by older devctl versions.
- Moving, rotating, or copying Miniflux credentials.
- Starting external dependencies automatically or introducing a general service supervisor.
- Changing production deployment, Feeds/Search APIs, or browser behavior.

## Decisions

### 1. Separate managed services from external dependencies

`SERVICE_NAMES` and the lifecycle adapter map contain only `web` and `cron`. A separate immutable dependency registry contains `miniflux`, `searxng`, and `supabase`, each with a configuration key and bounded health probe. This prevents a status-only dependency from accidentally becoming a legal lifecycle target.

Alternative considered: keep Miniflux/SearXNG as adapters with no-op start/stop. Rejected because the CLI would still imply ownership, accept misleading lifecycle commands, and complicate rollback state.

### 2. Preserve source environment instead of deriving checkout endpoints

Dynamic child environment continues to derive only Web/Cron topology (`PORT`, app origin, Cron origin and health port). It no longer writes `MINIFLUX_BASE_URL`, Miniflux token paths, `REPORTING_SEARXNG_URL`, ports, or secrets. The parsed `.env.local`/inherited environment remains authoritative.

Alternative considered: hardcode 8085/8086 in devctl. Rejected because the configured endpoint is the contract and deployments/worktrees may use other operator-owned addresses.

### 3. External health is diagnostic, not a lifecycle gate

Status probes use bounded HTTP requests and report `running`, `degraded`, `unreachable`, `invalid`, or `unconfigured` with ownership `external`. External health does not alter the managed aggregate state or block Web/Cron startup, matching the current Supabase behavior.

Miniflux is probed at its health endpoint, SearXNG at its health endpoint, and Supabase at `/auth/v1/health`. Probe URL construction discards credentials and never logs request headers or tokens.

### 4. Migrate legacy state without touching containers

When a legacy `.devctl/state.json` contains Miniflux/SearXNG records, devctl ignores and removes those records from newly written state without invoking their old adapter stop methods. Existing Compose containers and volumes remain untouched. This fail-safe migration is required because stopping legacy records would violate the new ownership boundary.

The serialized file retains the v1 four-port shape solely as a rollback compatibility envelope, while its service records contain only Web/Cron and the live manager exposes only their two assigned ports. The `miniflux`/`searxng` port keys in that envelope are reserved legacy metadata, not endpoints or lifecycle ownership. This lets the preceding devctl release read the file and execute an explicit `restart web cron` after a code rollback without recreating external dependencies.

## Risks / Trade-offs

- [External service is down while Web/Cron starts] → Status reports the failure independently; feature APIs retain their existing recoverable unavailable states.
- [Legacy duplicate containers continue consuming resources] → Do not delete automatically; report them separately and require an explicit operator cleanup decision.
- [Malformed external URL causes unsafe probing] → Parse with `URL`, require allowed loopback HTTP/HTTPS rules appropriate to each service, apply a short timeout, and never follow cross-origin redirects.
- [Old state still names external services] → Sanitize state before lifecycle selection and persist only managed records, without executing old container commands.

## Migration Plan

1. Land contract tests proving only Web/Cron are selectable and external dependencies are status-only.
2. Add external dependency probes and status formatting.
3. Remove Compose adapters and dynamic Miniflux/SearXNG environment overrides.
4. Restart devctl-managed Web/Cron so they inherit the existing 8085/8086 configuration.
5. Verify no new Compose projects are created and the original containers remain running.

Rollback is a code rollback followed by the explicit command `./devctl.sh restart web cron`. Do not use an unqualified old-version `restart`, because that intentionally restores the preceding release's four-service lifecycle behavior. Existing external containers and volumes are unaffected when the explicit Web/Cron rollback command is used.

## Open Questions

None.
