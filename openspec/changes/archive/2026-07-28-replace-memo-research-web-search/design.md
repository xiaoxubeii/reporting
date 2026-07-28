## Context

Memo Agent Stage 2 currently runs three parallel `provider.createMessage` calls and conditionally attaches Anthropic's native `web_search`. The product already owns a provider-neutral `reporting_search` tool for Deal Research, but that tool is intentionally bound to a live generalized `background_jobs` attempt: `/api/search` verifies the attempt token, actor, fund, Search access, tool-call ID, idempotency record, and per-job call budget. Memo Agent stages instead use `memo_agent_jobs`, so directly reusing the HTTP tool would fail the active-attempt checks and bypassing the route would weaken the security boundary.

The diligence UI and downstream memo stages already depend on `memo_agent_jobs` progress and `diligence_memo_drafts.research_output`. Migration must therefore preserve those compatibility records while making the generalized background attempt authoritative for external Search execution.

## Goals / Non-Goals

**Goals:**

- Make product Search the default and only enabled external-search implementation for Memo Research.
- Support every configured AI provider that implements the existing custom tool-loop contract.
- Preserve fund/user authorization, live entitlement checks, attempt leases, idempotency, global call limits, safe public query construction, and auditable citations.
- Preserve the existing three-sub-call research output and UI while moving citations to code-owned source IDs.
- Keep a disabled-by-default legacy native-search rollback path for one rollout window.

**Non-Goals:**

- Rebuild the Search adapters or ranking pipeline.
- Allow unrestricted model-authored web queries containing private data-room text.
- Migrate non-research Memo Agent stages to generalized background jobs in this change.
- Add personal Feed sources to background research.

## Decisions

### 1. Use a generalized `memo_research` background attempt plus a Memo compatibility record

The launch route atomically creates the generalized `memo_research` job and the existing `memo_agent_jobs` row for UI/progress compatibility. The generic payload carries `dealId`, `draftId`, and `memoJobId`, while `memo_agent_jobs.background_job_id` links back to the execution record. The legacy Memo worker excludes pending research projections that have a generalized background link; already-running legacy jobs are allowed to finish. Atomic enqueue prevents either half from existing alone.

The registered worker restores a real `BackgroundExecutionContext`, validates that all payload records still belong to the same fund/deal/draft, updates the compatibility row's progress, and runs Stage 2. Search calls therefore pass through the existing `/api/search` background route and its live authorization checks. The worker converts terminal Stage 2 outcomes into a terminal compatibility status; retryable transport failures remain governed by the generic attempt.

Alternative considered: call an extracted Search service directly from the admin Memo worker. Rejected because it would duplicate or bypass attempt-bound authorization, idempotency, and tool-call accounting.

### 2. Generalize the code-owned Search tool adapter

Move the reusable HTTP/token/evidence behavior out of `lib/deals` into a Search-owned agent-tool module. Callers supply a code-owned query planner and a namespace; the adapter retains response bounds, retry policy, untrusted-evidence wrapper, source collection, and exact allowed-source-ID contract.

Deal Research continues to use its existing five safe public topics. Memo Research uses a bounded topic vocabulary covering company, founder, market, competitors, website, claim verification, clinical/regulatory, technology, and intellectual property. The model selects only a topic plus a server-issued public subject identifier; server code constructs the final query. Arbitrary private claim text, emails, document contents, and financial projections are never accepted as tool arguments.

### 3. Replace native messages with custom tool loops

When external Search is enabled and the provider implements `createToolLoop`, each research sub-call uses the provider-neutral loop with the same output prompt plus `reporting_search`. Unsupported providers run the explicit no-search variant and produce a warning. When external Search is disabled, the existing single-message path remains available to avoid unnecessary tool-loop overhead.

The three parallel sub-calls share one database-enforced job budget. Tool-call IDs include a stable sub-call namespace so provider-local IDs cannot collide across claims, competitors, and founders calls. The registry permits three calls per complete Memo Research job; prompt guidance allocates calls but the database remains authoritative.

Alternative considered: precompute searches before the LLM call. Rejected because the desired behavior is model-directed tool use and because the three focused agents need different evidence adaptively.

### 4. Make Search source IDs authoritative

Each Search hit is collected by server code. Prompts require findings to reference only IDs from `citation_contract.allowed_source_ids`; parsing rejects or removes unknown IDs and maps accepted IDs to the existing `{title,url}` UI representation. `research_output` gains provider-neutral `search_sources` and `search_count` fields while retaining `web_sources` and `web_search_count` as transitional mirrors.

Anthropic text-block citation metadata is no longer used on the default path. Search results remain explicitly untrusted and cannot supply instructions.

### 5. Provider-neutral settings with a rollback flag

The persisted opt-in remains compatible with `memo_agent_web_search_enabled` for this migration, but API/UI terminology changes to “external Search” and capability resolution checks `supportsToolLoop`, not provider type. A server-only legacy flag can temporarily select Anthropic native search for rollback; it defaults off and is not exposed as a normal product setting.

## Risks / Trade-offs

- **[Dual job records drift]** → Centralize launch/finalization helpers, validate IDs and fund ownership at every worker hop, and test enqueue/failure reconciliation.
- **[Three parallel agents exceed budget]** → Enforce the total in `background_job_tool_calls` and share a stable attempt; do not rely only on in-memory counters.
- **[Tool loops increase latency and tokens]** → Keep three focused calls, bounded iterations, response limits, per-job limits, progress updates, and existing stage cost caps.
- **[Private material leaks into public queries]** → Use enum topics and server-built queries from public company/domain/founder identifiers; reject free-form query text and emails.
- **[Model invents citations]** → Validate every returned source ID against server-collected evidence before persistence and surface unsupported claims as gaps.
- **[Provider lacks tool loop]** → Run `no_search` mode with an explicit warning; never silently fall back to training-memory claims as externally verified.
- **[Legacy worker claims compatibility row]** → Create/transition the compatibility row into a non-pending delegated state before kicking either worker and cover the claim query in integration tests.

## Migration Plan

1. Add the compatibility link and atomic enqueue RPC, then add the `memo_research` registry policy, payload parser, worker route, and compatibility finalization helpers.
2. Extract/generalize the Search agent tool without changing Deal Research behavior.
3. Add provider-neutral tool-loop execution and citation validation to Stage 2 behind the new default path.
4. Update settings/diagnostics copy and transitional output fields.
5. Deploy with legacy native search disabled; validate an authenticated research run with Search enabled and a tool-capable provider.
6. Roll back by enabling the server-only legacy flag while leaving generalized jobs and compatibility output intact.

## Open Questions

- The first implementation will preserve the existing `memo_agent_web_search_enabled` database column to avoid a settings migration; it can be renamed in a later cleanup after all clients use provider-neutral terminology.
- The legacy native-search flag is intentionally temporary and should be removed after production evidence confirms source-ID grounding across supported providers.
