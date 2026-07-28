## Why

`devctl` currently creates checkout-specific Miniflux and SearXNG containers even when the operator-owned Reporting instances are already running. The duplicate Miniflux database breaks continuity for users, subscriptions, and API tokens, while duplicate search containers waste resources and obscure which runtime is authoritative.

## What Changes

- **BREAKING**: `devctl` manages the lifecycle of Web and Cron only; Miniflux and SearXNG are removed from the selectable lifecycle-service list.
- Treat configured Miniflux, SearXNG, and Supabase endpoints as external dependencies that are health-checked for diagnostic `status` output but are never created, restarted, stopped, or given checkout-specific ports by `devctl`.
- Keep external dependency health diagnostic and side-effect free: an unavailable dependency is reported by `status` but does not prevent Web/Cron from starting.
- Report external dependency ownership, endpoint, and health without exposing credentials.
- Preserve the standalone Compose and Miniflux provisioning entrypoints for operators; this change only removes their lifecycle ownership from `devctl`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-service-control`: Limit managed lifecycle units to Web and Cron, and generalize the external dependency contract from Supabase-only to Miniflux, SearXNG, and Supabase.

## Impact

- Affects `devctl.sh`, `scripts/devctl/**`, focused devctl tests, local-development documentation, and HarnessKit/OpenSpec planning state.
- Removes checkout-created Miniflux/SearXNG Compose projects and their `+2`/`+3` port allocation from future `devctl` runs; existing containers and volumes are not deleted by the implementation.
- Uses operator-configured `MINIFLUX_BASE_URL` and `REPORTING_SEARXNG_URL`; the current local configuration points to `http://127.0.0.1:8085` and `http://127.0.0.1:8086`.
