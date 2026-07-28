## Why

Memo Agent research currently depends on Anthropic's provider-native `web_search`, so external evidence is unavailable to other tool-capable providers and bypasses the product's fund-scoped Search policies, source registry, audit trail, and stable citation IDs. Research should use one code-owned Search capability regardless of model provider while preserving the initiating user's authorization and background-attempt boundaries.

## What Changes

- Replace provider-native web search in Memo Agent research with the existing Reporting `reporting_search` tool backed by the product Search runtime.
- Execute Memo Research through the generalized background-job attempt context required by `/api/search`, including tenant, actor, entitlement, lease, idempotency, and per-job call-limit enforcement.
- Run the three research sub-calls through provider tool loops when the configured provider supports them; providers without tool-loop support fail closed to an explicit no-search research mode.
- Expand the code-owned research query plan beyond generic company/founder topics to cover claim, market, competitor, clinical/regulatory, technology, and intellectual-property verification without exposing private deal-room text as arbitrary public queries.
- Persist Search-returned source IDs and normalized source metadata as the authoritative research citations, while retaining transitional output compatibility for existing research UI fields.
- Replace Anthropic-specific settings and diagnostics with provider-neutral external Search terminology and behavior.
- Retain a temporary rollback flag for the legacy Anthropic path during rollout, disabled by default and removable after acceptance.

## Capabilities

### New Capabilities

- `memo-research-reporting-search`: Provider-neutral, background-authorized Search tool use, evidence collection, source-ID grounding, limits, and fallback behavior for Memo Agent research.

### Modified Capabilities

None. No canonical root specs currently cover Memo Agent research or Reporting Search tool integration.

## Impact

- Memo Agent research stage, worker dispatch, stage-provider capability resolution, prompts, persistence, diagnostics, and settings copy.
- Generalized background-job registry, attempt context, Search capability policy, and worker routing.
- Reporting Search tool adapter and query planning.
- Database job/type contracts if Memo Research must persist generalized background attempts alongside existing `memo_agent_jobs` compatibility records.
- Focused unit/integration tests, security tests for cross-fund/replay/revocation behavior, and the authenticated diligence Research browser flow.
