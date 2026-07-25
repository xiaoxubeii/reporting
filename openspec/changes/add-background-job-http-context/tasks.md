## 1. Persistence and Configuration Contracts

- [x] 1.1 Add failing migration/security contract tests for service-only jobs, actor constraints, active dedupe, attempt/lease claim fencing, tool-call idempotency, and pending Deal Research backfill.
- [x] 1.2 Add a forward-only migration for `background_jobs`, `background_job_tool_calls`, service-only atomic claim/finalize/tool-call RPCs, indexes, constraints, and legacy pending/running Deal Research backfill.
- [x] 1.3 Update generated database types, `.env.example`, trusted internal-origin configuration, and devctl generation/propagation of a protected `BACKGROUND_JOB_TOKEN_SECRET`.

## 2. Background Job Core

- [x] 2.1 Add failing tests for strict job payload parsing, immutable code-owned kind policy, actor policy, fixed destinations, exact scopes, timeouts, leases, and retry limits.
- [x] 2.2 Implement immutable background-job types and the `deal_research` registry entry with a fixed worker path and distinct worker/Search audiences.
- [x] 2.3 Add failing tests for token signing/verification covering algorithm/type/issuer/exact audience/claims/expiry, per-hop isolation, malformed bearer values, and minimum secret length.
- [x] 2.4 Implement per-hop `jose` Job Token issuance and verification using `sub`, `job_attempt`, unique `jti`, bounded `nbf/iat/exp`, and server-only secret configuration.
- [x] 2.5 Add failing tests for `requireBackgroundExecutionContext` covering active attempt/lease, payload/fund/resource consistency, live membership/access, system public-only policy, revoked users, and stale/terminal attempts.
- [x] 2.6 Implement immutable HTTP context restoration and live authorization without accepting caller actor/fund/scope/destination fields.

## 3. Generic Dispatcher

- [x] 3.1 Add failing dispatcher tests for Cron authentication, atomic claim, fixed-origin/path POST, redirect denial, response bounds, timeout, 4xx/5xx/network retry classification, CAS finalization, and secret-free logs.
- [x] 3.2 Implement the generic background-job dispatcher on a generic Cron path, preserving Croner's schedule while replacing direct Deal scanning and in-process Research.
- [x] 3.3 Add runtime configuration tests proving internal URLs never derive from Host, forwarded headers, database payloads, public environment variables, or model input.

## 4. Deal Research Enqueue and Worker

- [x] 4.1 Add failing API/service tests for Session-derived manual actor attribution, foreign-Deal denial, active dedupe, explicit system auto-enqueue, and no admin proxy.
- [x] 4.2 Change manual Deal Research to use the live route access gate and enqueue a user job; change qualifying inbound processing to enqueue a system job and keep Deal status projection consistent.
- [x] 4.3 Add failing worker tests for exact worker audience, empty body/actor-field rejection, Deal/fund consistency, attempt fencing before final persistence, and terminal result mapping.
- [x] 4.4 Implement the HTTP-only Deal Research worker and move Deal loading/provider execution behind restored job context.

## 5. Search Background Authentication and Idempotency

- [x] 5.1 Extend Search route tests first for mutually exclusive Session versus Authorization modes, invalid-bearer no-fallback, wrong audience, stale attempt, mixed cookie/bearer, and unchanged Same-Origin browser behavior.
- [x] 5.2 Add failing tests for Search job request projection, persisted `toolCallId` request-hash idempotency, call budget, user live access, and public-only runtime for both user and system Deal Research.
- [x] 5.3 Implement `/api/search` Job Token mode using the same Search policy/runtime/adapters/merge/envelope path, server-projected categories, independent bounded rate keys, and cached idempotent tool-call responses.

## 6. Provider Tool Loops

- [x] 6.1 Add failing Anthropic tool-loop tests for abort propagation, ordered multi-call execution, usage aggregation, executor errors, and explicit exhaustion without final text.
- [x] 6.2 Correct Anthropic tool-loop deadline/exhaustion semantics without changing existing plain message/chat behavior.
- [x] 6.3 Add failing OpenAI-compatible tests for tool definitions, assistant `tool_calls`, matching tool messages/ids, malformed arguments, multiple calls, usage aggregation, abort, exhaustion, and unsupported endpoint errors.
- [x] 6.4 Implement `OpenAIProvider.createToolLoop` for OpenAI/OpenRouter/custom endpoints while preserving custom request parameters, redirect protection, and plain completion contracts.

## 7. Deal Research Search Tool and Provenance

- [x] 7.1 Add failing tool tests for bounded public-identifier-anchored queries, private/email/control-character rejection, server-generated tool call ids, per-hop Search tokens, fixed Search URL, redirect/response bounds, three-call limit, and HTTP retry idempotency.
- [x] 7.2 Implement the `reporting_search` provider tool as an HTTP client of existing `/api/search`, keeping token/origin/actor/adapter/limits outside the model-visible contract.
- [x] 7.3 Add failing Research tests for configured Anthropic/OpenAI/OpenRouter selection, at least one successful Search, empty/partial/error/zero-tool behavior, no ungrounded fallback, source dedupe, fabricated-citation rejection, personal Feed exclusion, and attempt-bound final writes.
- [x] 7.4 Replace Anthropic native Web Search with the bounded provider tool loop and persist only server-collected Search evidence plus aggregated usage.

## 8. Verification and Review

- [x] 8.1 Run focused migration, background-job, dispatcher, Research worker, Search route/tool, and Anthropic/OpenAI provider tests; resolve all in-scope failures.
- [x] 8.2 Run generated type checks, changed-scope ESLint, TypeScript, strict OpenSpec, HarnessKit fast/targeted, secret scan, dependency audit, and production build; record unrelated baseline blockers separately.
- [x] 8.3 Run a real isolated Session enqueue → Croner → dispatcher → Research HTTP worker → configured provider tool call → `/api/search` → source-backed terminal result flow, including one revoked/stale-attempt negative path.
- [x] 8.4 Complete independent correctness and security reviews for concurrency, JWT/audience/replay, confused deputy, SSRF/redirects, RLS/service role, cross-fund access, personal Feed privacy, provider fallback, and source provenance; fix all blocker/high findings.
- [x] 8.5 Update OpenSpec tasks and HarnessKit feature progress with changed files, verification evidence, remaining risks, and completion self-check.

## 9. Generic HTTP Job Completion Audit

- [x] 9.1 Add failing contracts proving the Cron dispatcher enumerates the code-owned registry, uses one generic HTTP route, and retains a global claim/concurrency bound.
- [x] 9.2 Refactor shared policy, token, and context types so Search is an optional capability and kind-specific resource authorization is outside the generic context core.
- [x] 9.3 Move Croner and the worker under generic background-job HTTP paths while preserving exact-audience verification and fail-closed middleware behavior.
- [x] 9.4 Re-run focused/full verification and a real Session → generic Croner → worker → Search HTTP flow, then complete independent correctness and security review.
