## 1. Planning and Baseline

- [x] 1.1 Validate the OpenSpec change strictly, record the isolated worktree baseline, and identify the exact current Memo Research, generic background-job, Search, provider, settings, and UI contracts.
- [x] 1.2 Add the HarnessKit feature contract and confirm the main-agent-only architecture path and verification scope.

## 2. Contract-First Coverage

- [x] 2.1 Add failing registry and payload tests for the `memo_research` job kind, fixed worker route/audience/scope, required access, and one shared Search budget.
- [x] 2.2 Add failing launch/worker lifecycle tests proving actor/fund/deal/draft/memo-job validation, legacy-worker exclusion, progress compatibility, terminal writeback, and stale/cross-fund rejection.
- [x] 2.3 Add failing Search tool tests for memo topics, server-built public queries, unsafe argument rejection, sub-call namespaces, shared limit behavior, untrusted evidence, and exact source-ID collection.
- [x] 2.4 Add failing Memo Research stage tests for provider-neutral tool loops, unsupported-provider no-search fallback, legacy rollback, source-ID validation, and transitional output compatibility.

## 3. Generalized Background Execution

- [x] 3.1 Add the validated `memo_research` payload and registry policy with Diligence/Search access, fixed worker destination, attempt settings, and bounded Search capability.
- [x] 3.2 Implement the Memo Research compatibility enqueue helper and route integration so the existing UI job record cannot be claimed by the legacy worker and enqueue failure is reconciled.
- [x] 3.3 Implement the attempt-authenticated Memo Research worker route, live resource validation, progress/final compatibility updates, and deterministic failure handling.
- [x] 3.4 Update generated database/application types or migrations required by the compatibility lifecycle, including explicit grants for new database objects.

## 4. Provider-Neutral Reporting Search Tool

- [x] 4.1 Extract the reusable HTTP/token/retry/evidence/source-ID behavior into a Search-owned agent-tool module while preserving Deal Research behavior.
- [x] 4.2 Implement the Memo Research bounded topic/query planner and reject arbitrary private text, emails, unsupported fields, control characters, and unsupported topics.
- [x] 4.3 Namespace tool-call IDs per research sub-call and enforce one database-backed Search budget across claims, competitors, and founders.

## 5. Memo Research Integration

- [x] 5.1 Replace the enabled default native-search calls with `createToolLoop`, attach `reporting_search`, retain bounded iterations, and explicitly degrade unsupported providers to no-search mode.
- [x] 5.2 Validate model citations against collected source IDs and persist provider-neutral `search_sources` / `search_count` with transitional legacy field mirrors.
- [x] 5.3 Add the disabled-by-default server rollback path for Anthropic native search and document its temporary operational use.
- [x] 5.4 Update settings, progress, diagnostics, and localized copy from Anthropic-specific web search to provider-neutral external Search without changing the existing Research page workflow.

## 6. Verification and Review

- [x] 6.1 Run focused tests, migration/type checks, changed-file lint, TypeScript, strict OpenSpec validation, `git diff --check`, and HarnessKit fast/targeted verification; resolve failures in scope.
- [x] 6.2 Run the relevant full suite and production build, documenting only verified pre-existing environmental blockers.
- [x] 6.3 Complete independent code, TypeScript, database, and security reviews; fix all critical/high findings and re-run affected checks.
- [x] 6.4 Exercise the authenticated diligence Research browser flow from an ingested draft through terminal Search diagnostics and grounded sources, capturing console/network/final-state evidence.
- [x] 6.5 Update OpenSpec tasks and HarnessKit progress/evidence with the final requirement-by-requirement completion audit.

Browser verification used an isolated synthetic fund and ingested draft. The authenticated Research action completed through the generalized worker with three successful `reporting_search` calls, provider-neutral terminal diagnostics, nine accepted sources after Memo exclusions, and fail-closed handling when the model returned no accepted source IDs. The fixture, jobs, fund, user, and local credential link were removed after capture.
