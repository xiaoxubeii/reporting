## Context

Reporting currently declares five Vercel Cron schedules that issue authenticated GET requests to existing Next.js route handlers. Those handlers already own the business-level queue and recovery semantics: memo jobs live in `memo_agent_jobs`, deal research is represented by `inbound_deals.research_status`, and Heartbeat keeps a unique ingestion claim. Replacing the handlers or those tables would create unnecessary scope. The requested change is therefore a process-topology change: run the existing Next.js application with `next start` on a persistent Node host and run one independent Croner scheduler process beside it.

The scheduler is security-sensitive because it holds `CRON_SECRET`, and concurrency-sensitive because duplicate scheduler replicas can trigger non-idempotent work such as digest email delivery. Croner intentionally stores no durable execution state, so its operational contract must be explicit rather than implying queue guarantees it does not provide.

## Goals / Non-Goals

**Goals:**

- Preserve the five existing paths, schedules, GET method, and bearer-secret authentication contract.
- Provide separate, production-ready Web and Cron process entrypoints with no custom Next.js server.
- Fail before registering schedules when the destination or secret is invalid.
- Prevent the same job from overlapping within the Cron process and bound every HTTP request.
- Expose minimal liveness/readiness endpoints, emit secret-free structured logs, and stop cleanly on SIGTERM/SIGINT.
- Provide a one-shot execution mode that exercises the real HTTP and authentication path for deployment verification.
- Remove Vercel-owned recurring schedules only after the replacement path exists.

**Non-Goals:**

- Persist Croner trigger occurrences, backfill missed schedules, or introduce a durable queue.
- Rewrite route handlers, memo-agent stages, callbacks, or business status tables.
- Guarantee exactly-once delivery across multiple Cron service replicas.
- Embed scheduling inside the Web process or automatically elect a leader among Web replicas.
- Select or provision a specific hosting vendor.

## Decisions

### Keep Next.js as the persistent HTTP runtime

`npm run start` continues to use the supported `next start` server. This preserves every page, middleware rule, route handler, and server dependency. A Hono/Nitro/custom-server migration would change the HTTP contract without improving the scheduler.

### Run Croner as an independent process

`npm run cron:start` starts a plain Node.js ESM entrypoint. The Cron process is deployed with exactly one replica while the Web process may scale independently. Embedding Croner in `next start` was rejected because every Web replica would register the same schedules and rolling deploys would overlap old and new schedulers.

### Reuse the authenticated HTTP boundary

The runner invokes the current `/api/cron/*` routes with `GET` and `Authorization: Bearer ${CRON_SECRET}`. Calling route business code directly was rejected because those modules mix response handling with domain work and direct imports would create a second, untested execution boundary. Redirects are rejected so the bearer secret cannot be forwarded to another origin.

### Keep one immutable schedule manifest

The runner owns a frozen manifest containing the five names, paths, UTC expressions, and request timeouts. Tests compare this manifest with the former Vercel schedule contract. Croner receives `timezone: "UTC"`, a stable job name, and a `protect` callback so a second occurrence in the same process is skipped and logged while the previous Promise is active.

### Validate configuration before scheduling

`CRON_RUNNER_BASE_URL` must be an origin-only HTTP(S) URL without credentials, query, or fragment. Production requires HTTPS unless `CRON_RUNNER_ALLOW_INSECURE_HTTP=true` is explicitly set for a trusted private network. `CRON_SECRET` must be present, contain no control characters, and contain at least 32 characters in production. Invalid timeout, health, or shutdown values fail fast without logging secret values.

### Make lifecycle and observability part of the runtime

A built-in Node HTTP server exposes only minimal `/healthz` and `/readyz` JSON responses and returns a bounded 400 response for malformed request targets instead of throwing from the unauthenticated handler. Job starts and completions are JSON log lines containing name, duration, outcome, and status code, never request headers, secret, response body, or full destination URL. On SIGTERM/SIGINT the runner stops every Croner timer, closes health listeners, and waits up to the configured grace period for tracked invocations before aborting remaining requests.

### Keep durability in existing domain state

Croner does not gain a new database. A missed occurrence is not backfilled; the next memo/deal-research/Heartbeat scan processes database-backed pending work according to existing behavior. Digest and Affinity retain their current at-most-next-occurrence semantics. If durable per-occurrence delivery becomes required later, that is a separate queue capability rather than hidden complexity in this scheduler.

## Risks / Trade-offs

- **A second Cron replica duplicates triggers** → Deployment documentation requires exactly one Cron replica; Web and Cron process types remain separate.
- **Process downtime misses an occurrence** → The supervisor automatically restarts the process; health monitoring alerts on downtime; existing database scanners recover pending work on the next occurrence. No false backfill guarantee is claimed.
- **A request hangs during shutdown** → Every request has an AbortController timeout and shutdown has a bounded grace period followed by abort.
- **Bearer secret leaks through logs or redirects** → Logs exclude headers and complete URLs, configuration errors redact values, and fetch rejects redirects.
- **Self-hosted HTTP is required on a private network** → Plain HTTP is rejected in production unless an explicit opt-in is set.
- **Removing Vercel schedules creates a cutover race** → Verify the runner in one-shot mode first, then remove Vercel schedules and start exactly one Cron service; never leave both schedulers active beyond the controlled cutover.
- **Croner status is in-memory** → Health and logs describe the current process only; existing application tables remain the source of truth for business jobs.

## Migration Plan

1. Install the Croner dependency and deploy the Web image with the new scripts, without starting the recurring Cron process.
2. Point `CRON_RUNNER_BASE_URL` at the production Web origin, load the same `CRON_SECRET`, and execute each job through one-shot mode to verify method, path, authentication, timeout, and response handling.
3. Configure the process supervisor with one Web process and exactly one Cron process, automatic restart, and health checks.
4. Remove `vercel.json` recurring schedules and deploy that configuration.
5. Start the Cron process and confirm all five next-run timestamps and health status in logs.
6. Roll back by stopping the Cron process first and restoring the Vercel schedules; never run both during a steady state.

## Open Questions

None. Hosting-specific service definitions remain deployment configuration because no production platform was selected.
