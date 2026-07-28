## Context

The current persistent Croner calls fixed Next.js Cron routes with `Authorization: Bearer ${CRON_SECRET}`. The Deal Research Cron route then scans `inbound_deals.research_status`, claims rows, and calls `runDealResearch` in-process. A manual Research request has an authenticated Session and `user.id`, but only persists `research_status = 'pending'`; the later Cron request therefore knows the fund and Deal but not the initiating user. Automatic Research requests created during inbound processing have no user actor at all.

Reporting Search is currently a browser-only `POST /api/search` boundary: it enforces Same-Origin, Session authentication, live route access, per-user/fund rate limiting, category/source policy, and user-specific Feed credentials. Deal Research instead forces Anthropic and enables Anthropic's native Web Search, so an OpenRouter `deal_analysis` configuration is skipped and Reporting's Search sources are unavailable.

The agreed topology is HTTP-only after enqueue. Croner, the dispatcher, the Research worker, and Search are distinct HTTP hops even if they run on the same deployment. The design therefore needs a durable actor reference and a bounded delegation credential; it must not copy a browser Session or accept a caller-supplied user id.

## Goals / Non-Goals

**Goals:**

- Provide one generic, service-owned background-job identity and lifecycle contract reusable by Cron-triggered HTTP work.
- Preserve a user actor from the enqueue Session and represent automatic work explicitly as `system`.
- Keep `CRON_SECRET` limited to scheduler authentication and use a short-lived attempt-scoped Job Token for every downstream HTTP hop.
- Restore authorization from the current database state on every HTTP request rather than treating token claims as an access snapshot.
- Route Deal Research through a real HTTP worker and let the configured LLM decide whether and how often to call the existing `/api/search` endpoint as a provider tool.
- Support the current Anthropic and OpenAI-compatible/OpenRouter provider paths with one bounded tool-loop contract and trustworthy Search-derived sources.

**Non-Goals:**

- Replacing every existing `memo_agent_jobs` workflow in the first migration; other job kinds may adopt the generic contract incrementally.
- Giving Croner, browsers, or LLMs a long-lived user token, Supabase Session, service-role key, arbitrary target URL, adapter id, endpoint, or scope.
- Adding a distributed message broker, external identity service, provider-plugin registry, search index, or new Search implementation.
- Allowing automatic `system` jobs to access a user's personal Feed sources.
- Allowing fund-shared Deal Research, including user-attributed runs, to expose personal Feed sources to the shared Deal record or model.
- Silently running ungrounded Research when the configured provider or endpoint cannot perform tool calls.

## Decisions

### 1. A service-owned `background_jobs` row is the durable identity source

The table stores `kind`, schema-validated `payload`, `fund_id`, `actor_type`, nullable `actor_user_id`, status, dedupe key, attempt id, lease, availability, attempts, last error, and timestamps. A companion `background_job_tool_calls` table stores attempt-bound tool call ids, request hashes, status, and bounded cached responses so HTTP retries do not repeat a Search. RLS is enabled with no browser policies; only service-role server code and tightly scoped service-only RPCs can create, claim, finalize, or record calls. A check constraint requires a user id for `actor_type = 'user'` and forbids one for `actor_type = 'system'`.

The row, not the token, is authoritative for actor and fund identity. This keeps tokens small, makes permission revocation effective on the next request, and prevents a signed but stale role/access snapshot from becoming authorization.

Alternative considered: add `research_requested_by` directly to `inbound_deals`. Rejected because it only fixes one queue, the row is currently fund-member manageable, and it does not provide attempt/lease/replay semantics for other HTTP jobs.

### 2. Job kinds are registered in code, not stored as destinations

A frozen registry maps each `kind` to a payload parser, fixed same-origin worker path, worker audience/scope, optional Search capability, maximum attempts, request timeout, lease duration, actor policy, and live access requirements. V1 registers `deal_research`; no client, database payload, LLM, or request body can select a URL or grant a scope. The dispatcher enumerates this registry and atomically claims the registered kind set under one global concurrency bound. The token and context cores contain no Deal Research branch; kind-specific resource authorization lives in a domain adapter.

Alternative considered: persist `target_url` and `scopes` in the job. Rejected because a compromised enqueue path would become an SSRF and confused-deputy primitive.

### 3. Scheduler authentication and per-hop job delegation use separate secrets

Croner continues to call the dispatcher with `CRON_SECRET`. The dispatcher verifies that secret, atomically claims due work, and signs an HS256 JWT with a distinct high-entropy `BACKGROUND_JOB_TOKEN_SECRET` of at least 32 random bytes. Claims are limited to fixed token type, issuer, one exact audience, `sub = job_id`, `job_attempt = attempt_id`, a unique `jti`, not-before/issue time, and expiration. Expiry never exceeds the current lease. Verification accepts only the configured local HS256 key and never resolves remote key URLs.

Every hop receives a distinct audience token. Dispatcher → Deal Research uses `aud = reporting-deal-research-worker`. The verified Research worker signs each Research → Search request with `aud = reporting-search` and `jti = tool_call_id`, still bound to the same job and attempt. A worker token therefore cannot call Search and a Search token cannot invoke a worker. The dispatcher never forwards `CRON_SECRET`, and Job Tokens never reach the browser, model prompt, tool schema, provider request, response body, or logs.

The implementation uses the maintained `jose` library rather than custom JWT parsing or signature code.

Alternative considered: reuse `CRON_SECRET` for all hops. Rejected because it grants every downstream receiver scheduler-wide authority and makes a single leaked request credential useful indefinitely across job kinds.

### 4. Every receiver independently restores `BackgroundExecutionContext`

`requireBackgroundExecutionContext(request, expectedAudience, requiredScope)` performs:

1. fail-closed bearer parsing and JWT verification for token type, issuer, exact single audience, algorithm, timestamps, allowed claims, and secret;
2. lookup by `job_id + attempt_id` and verification of `running` status and unexpired lease;
3. payload revalidation against the registered job kind;
4. scope authorization from the code-owned kind policy;
5. resource/fund consistency checks;
6. for user actors, a live `fund_members` lookup plus `loadAccessContext` and required feature access;
7. for system actors, construction of a restricted public-source context with no personal Feed capability.

It returns an immutable context. URL/body `userId`, `fundId`, `scope`, or actor fields are ignored or rejected. Job completion, failure, retry, or lease replacement invalidates earlier tokens because the database attempt/status check fails even before token expiry. Within one active attempt, worker tokens may be retried idempotently, while Search tokens are bound to a unique tool call id: the first valid request claims the call, an identical retry returns the bounded cached result, a request-hash mismatch fails, and new ids are rejected after the job's call budget is exhausted.

### 5. The dispatcher owns claim, retry, and terminal transitions

A service-only SQL claim function accepts the code-owned registered kind set, uses `FOR UPDATE SKIP LOCKED`, requeues expired leases, increments attempts, assigns a new UUID attempt, and returns one globally bounded batch. The Dispatcher invokes each registered worker over a trusted same-origin base URL, with redirects disabled and a per-kind timeout and persisted per-kind lease.

- A conforming 2xx worker result finalizes the claimed attempt as completed.
- Retryable network/timeout/5xx failures clear the attempt, apply bounded backoff, and return the job to pending until the maximum attempt count.
- 4xx, invalid job output, or exhausted attempts finalize as failed.
- Every finalization uses `id + attempt_id + status = running`, so an old worker cannot overwrite a newer attempt.

`dedupe_key` has a partial unique index for pending/running jobs. Deal Research uses `deal_research:<deal_id>`. Domain state on `inbound_deals` remains the user-facing result projection, while `background_jobs` becomes the execution authority. Execution is at-least-once across expired attempts: attempt fencing prevents stale persistence, but a process crash after an external provider charged and before durable completion can still cause a later attempt to be billed again.

### 6. Deal Research has user and system enqueue modes

Manual `POST /api/deals/:id/research` derives `actor_user_id` and `fund_id` from the Session and live access gate, then enqueues a user job. Automatic qualifying deals enqueue a system job after the Deal is created. Existing pending rows are backfilled once as system jobs during migration/rollout; system Search is limited to public Web and professional sources.

Actor attribution is retained for authorization, rate identity, and audit, but `deal_research` is a fund-shared job kind and its immutable registry policy sets `allowPersonalSources = false` for both user and system actors. Its Search calls therefore use only public Web and professional sources. The generic context contract can support private-source job kinds later only through an explicit code-owned policy and a destination whose result remains private to the actor.

The worker route accepts no actor information. It restores the job context, verifies `payload.dealId` belongs to the same fund, loads Deal data server-side, and calls the configured `deal_analysis` provider.

### 7. `/api/search` uses explicit dual authentication without duplicating Search

The current browser mode remains unchanged: no Authorization bearer header, Same-Origin JSON request, Supabase Session, `assertRouteAccess`, and the existing per-user/fund rate limit.

Presence of any Authorization header selects background mode. Invalid, non-Bearer, wrong-audience, or stale Job Tokens return 401 and never fall back to a browser Session, even when a valid Session cookie is also present. Background mode restores context with `aud = reporting-search` and `search:execute`; source eligibility is projected from immutable job policy. `deal_research` always receives public-only Search even for a user actor. Both modes then run the same source-policy, runtime, adapters, merge, metrics, response envelope, and bounded request path.

Background Search accepts only `{query, toolCallId}`; categories, adapters, source eligibility, limits, actor, and fund are projected from the verified job policy and current fund configuration. The Search tool calls the existing absolute `/api/search` URL derived exclusively from a validated server-only `BACKGROUND_JOB_INTERNAL_ORIGIN`, never `Host`, forwarded headers, database data, public environment values, or model input. It rechecks the exact origin/path, disables redirects, passes the Search-audience token, JSON content type, and abort signal, and accepts only a bounded JSON Search response with the documented envelope and content type.

### 8. The model controls tool use, but never identity or transport

Deal Research supplies one `reporting_search` function tool. Its input contains only a bounded public-information query. The server generates the tool call id, projects allowed categories, rejects control characters/email/private-summary fragments, and permits only queries anchored to trusted public Deal identifiers such as company name/domain or founder name. The tool executor enforces schema, a persisted maximum of three calls per attempt, the job deadline, source availability, and response-size/result limits. Its public-only job policy excludes personal Feed results before evidence can reach the model or shared Deal record.

The token is captured by server code and cannot appear in model-authored arguments. Source persistence is collected by the executor from the exact normalized Search results returned to the model; model-authored URLs and legacy Anthropic citations are ignored. Research may finish as `done` only after at least one Search call returns usable external evidence. Zero tool calls, all-empty/failed Search calls, or model-only output produce an explicit no-evidence failure; the model still decides when and what to search, but it cannot label memory-only output as external Research.

### 9. Anthropic and OpenAI-compatible providers share fail-closed loop semantics

Anthropic retains its existing client tool loop, with bounded iteration/deadline handling corrected so exhaustion without a final text response is an explicit error. `OpenAIProvider` implements the same interface using `tools`, assistant `tool_calls`, and `role: 'tool'` result messages; it aggregates usage across rounds and supports multiple calls deterministically.

OpenAI/OpenRouter/custom endpoints use this implementation. A protocol error showing the endpoint/model rejects tools is surfaced as an unsupported-tool failure and marks Research skipped/failed with a clear message. Gemini/Ollama or any provider without a verified tool loop fails closed for Deal Research. No provider falls back to `createMessage` for this feature.

### 10. Limits and observability are layered

- Dispatcher batch and wall-clock budget remain bounded.
- Per-kind HTTP timeout and lease exceed the worker deadline with small headroom.
- Research allows at most three persisted Search tool calls and four model round trips, with one shared abort deadline.
- `/api/search` retains fund/user rate limiting; system jobs use a job/fund key and cannot use Feeds.
- Logs include job id, attempt id, kind, route, outcome, duration, source ids, and counts, but omit tokens, queries, Feed content, credentials, and provider secrets.

## Risks / Trade-offs

- **[Same-deployment recursive HTTP can consume two request slots]** → Keep a small dispatcher batch, strict worker timeout, and deploy on a server capable of concurrent requests; verify the real topology.
- **[Bearer token leakage permits bounded replay]** → Per-hop exact audiences, short expiry, attempt/lease/database checks, persisted tool-call ids and request hashes, fixed scopes, no logging, no redirects, rate limits, and terminal-state invalidation.
- **[User access changes during a long Research request]** → Recheck at worker start, every Search HTTP call, and before final persistence; fail closed if revoked.
- **[System jobs have no personal Search identity]** → Build a public-only Search runtime and never select an admin or arbitrary member as a proxy.
- **[Custom OpenAI-compatible endpoints differ in tool support]** → Treat support as runtime capability, validate protocol responses, and fail explicitly without ungrounded fallback.
- **[Queue and Deal projection can diverge]** → Make `background_jobs` authoritative for execution, use idempotent enqueue/dedupe, attempt-bound writes, and repair projection from terminal job outcomes.
- **[Search results contain prompt injection]** → Keep Search output inside an explicitly untrusted evidence wrapper, bound text/size, and retain system instructions that evidence cannot change tool or identity rules.

## Migration Plan

1. Add `BACKGROUND_JOB_TOKEN_SECRET` and validated `BACKGROUND_JOB_INTERNAL_ORIGIN` to server configuration, local devctl secret generation, and deployment documentation before enabling dispatch.
2. Apply the `background_jobs` table, service-only claim/finalize functions, indexes, constraints, and generated types.
3. Deploy token, policy, context, and dispatcher code with no registered live jobs; verify secret/auth/claim contracts.
4. Add `/api/search` background authentication and provider tool-loop support; keep browser Search unchanged.
5. Register the Deal Research worker and switch manual/automatic enqueue to `background_jobs`; backfill existing pending Deals as system jobs.
6. Replace the current Deal Research Cron implementation with the generic dispatcher path while preserving its Croner schedule/path or updating the manifest atomically.
7. Run isolated real HTTP verification, then remove obsolete direct claim/in-process Research code.

Rollback disables the dispatcher route/manifest first, leaving pending job rows durable. Application code can be rolled back while retaining the additive table and columns; no destructive migration is required. Jobs created by the new code must not be reinterpreted as authenticated user Sessions by older code.

## Open Questions

None for V1. The initial job-kind registry contains only `deal_research`; adopting existing Memo Agent jobs is a separate incremental change using the same contract.
