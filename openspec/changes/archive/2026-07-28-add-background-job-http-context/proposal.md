## Why

Croner currently authenticates itself with `CRON_SECRET`, but queued Deal Research drops the requesting user's identity before execution. That prevents an HTTP-only Research worker from safely restoring the initiating user's current authorization when using Reporting Search, and the same identity gap will recur for other background HTTP jobs.

## What Changes

- Add a service-owned generic background-job record that durably binds each job to its actor, fund, validated payload, attempt, lease, and lifecycle.
- Add an authenticated background-job dispatcher that uses `CRON_SECRET` only for scheduler authentication, claims work atomically, and invokes a code-allowlisted HTTP worker with a short-lived attempt-scoped Job Token.
- Add shared per-hop Job Token issuance/verification and `BackgroundExecutionContext` restoration for HTTP receivers, including exact audience, live membership, feature-access, job-kind, route-scope, attempt, lease, and tool-call replay checks.
- Queue manual Deal Research as a user-attributed background job and execute it through an HTTP worker instead of directly inside the Cron route.
- Expose the existing Reporting Search execution path to background jobs through the existing `/api/search` endpoint without duplicating adapters, source policy, category configuration, or merge behavior.
- Replace Anthropic-only native Web Search in Deal Research with a provider tool whose invocation is decided by the configured LLM and whose implementation calls `/api/search` over HTTP using the Job Token.
- Add compatible tool-loop behavior for the OpenAI-compatible provider path used by OpenAI/OpenRouter/custom endpoints; fail closed when the configured endpoint cannot execute tools.
- Preserve browser Session/Same-Origin authentication for interactive Search while adding a distinct fail-closed Job Token authentication mode.

## Capabilities

### New Capabilities

- `background-job-http-context`: Durable actor attribution, Cron dispatch, short-lived attempt tokens, HTTP context restoration, authorization, retries, and audit boundaries for generic background jobs.
- `deal-research-search-tool`: User-attributed Deal Research executed over HTTP with LLM-directed access to the existing Reporting Search endpoint and trustworthy source capture.
- `ai-provider-tool-loop`: Provider-neutral function-tool iteration for Anthropic and OpenAI-compatible providers, including OpenRouter/custom capability failures, limits, deadlines, and usage aggregation.

### Modified Capabilities

None.

## Impact

- Database: forward-only migration for `background_jobs` and idempotent job tool calls, RLS/service ownership, indexes, deduplication, attempts, leases, and call budgets; generated database types.
- Runtime: Croner continues calling an authenticated Cron route, which becomes a generic dispatcher and sends bounded same-origin HTTP worker requests.
- APIs: new internal Research worker route; `/api/search` gains a separate Job Token authentication mode while preserving its browser contract.
- Services: new `lib/background-jobs/**`, shared Search execution orchestration, Deal Research tool adapter, and provider tool-loop support.
- Configuration: new server-only `BACKGROUND_JOB_TOKEN_SECRET` and a fixed internal application base URL derived from trusted server configuration.
- Tests and operations: migration/security contracts, token/context tests, dispatcher concurrency/retry tests, Search dual-auth tests, provider tool-loop tests, and a real Croner → dispatcher → Research → Search HTTP verification path.
