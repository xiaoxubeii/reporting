## Why

Production background work currently depends on Vercel Cron invoking five authenticated Next.js routes, while local `vercel dev` does not run those schedules and the application cannot own the scheduler lifecycle. The project needs one lightweight, portable production path that preserves the existing route and database contracts while running both the web application and its scheduler as supervised Node.js processes.

## What Changes

- Add a persistent Croner-based Node.js process that owns the existing five UTC schedules and invokes the existing authenticated GET routes.
- Add explicit production process commands for the persistent Next.js web server and the independent single-replica Cron service.
- Add fail-fast destination and secret validation, per-job overlap protection and request timeouts, concise result logging, a health endpoint, and graceful shutdown.
- Add an operational one-shot mode so the real entrypoint and authentication transport can be verified without waiting for a schedule.
- Document the single-replica and process-supervisor requirements and the intentional lack of missed-run backfill in Croner.
- Remove the recurring `crons` declarations from `vercel.json` after the replacement path is verified; existing API paths and `CRON_SECRET` authentication remain compatible.

## Capabilities

### New Capabilities

- `persistent-cron-runtime`: A supervised Croner service schedules, invokes, observes, and gracefully stops the existing production cron routes while the Next.js application runs as a persistent Node.js service.

### Modified Capabilities

None.

## Impact

- Adds the zero-dependency `croner` runtime package and Node.js scheduler modules under `scripts/cron-runner/`.
- Changes production commands and server-only environment configuration in `package.json`, the lockfile, and `.env.example`.
- Removes Vercel-owned recurring schedules while retaining Vercel function metadata for compatibility.
- Preserves all five cron route paths, HTTP methods, authorization behavior, database status tables, webhook routes, and memo-agent job handlers.
- Requires production to supervise one Web process and exactly one Cron process; Croner remains an in-memory scheduler rather than a durable queue.
