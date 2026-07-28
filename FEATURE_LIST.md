# Comprehensive website E2E feature list

This document is the acceptance inventory for `feature/comprehensive-site-e2e`.
The authoritative browser report is retained under
`.harnesskit/evidence/comprehensive-site-e2e/`.

## Final verification status

| Layer | Result |
| --- | --- |
| Playwright Chromium | 29/29 passed; 0 skipped, flaky, timed out, interrupted, or unexpected |
| Browser projects | Desktop and representative mobile viewport |
| Vitest | 338 files and 2,280 tests passed; 4 files and 8 environment-gated tests skipped |
| TypeScript | `tsc --noEmit` passed |
| Production build | `next build --no-lint` passed, including 276 generated pages; Cron dispatcher remains dynamic |
| OpenSpec | `add-comprehensive-site-e2e --strict` passed |
| HarnessKit fast | Passed |
| Changed-source ESLint | 176 JavaScript/TypeScript files passed with `--max-warnings 0` |

## Tested product capabilities

### 1. Search

- Executes every adapter enabled by the live Search registry rather than a hard-coded test list.
- Verifies representative results, safe empty states, source provenance, normalized URLs, and authorization.
- Preserves successful Web results when the personal Feeds dependency loses authentication.
- Rejects unsafe or cross-Fund access and treats unexpected first-party failures as test failures.

### 2. Subscriptions and Feeds

- Provisions and reprovisions a personal Miniflux identity through the real interface.
- Discovers and follows curated sources into existing and newly created personal categories.
- Covers duplicate follow, read/save state, unfollow, Following grouping, Explore, Trending, and Deal Signals.
- Confirms Feed-to-Deal conversion through the product UI and background-job boundary.
- Proves personal subscription state is isolated between Funds and cannot mutate the curated collector.
- Shows explicit degraded behavior when Miniflux, Search, or discovery dependencies are unavailable.

### 3. Pre-investment workflow

- Public Pitch creates exactly one Fund-scoped Inbound record and Deal.
- Deal Research is queued and dispatched through the real Cron/worker path, reaches a truthful terminal state, and supports retry.
- Concurrent promotion is atomic: one Diligence record is created and repeated promotion is idempotently rejected.
- Data Room upload and ingestion use the real UI and worker path with source provenance preserved.
- Expert validation covers directory creation, invitation, public response, immutable materialization, and re-ingestion.
- Applies the Fund checklist, records all seven scoring dimensions, and preserves 114 unresolved evidence gaps.
- Rejects an empty recommendation, finalizes the Memo exactly once, and only then permits a final `Passed` decision.
- Verifies database postconditions, no duplicate terminal objects, and no cross-Fund leakage.

### 4. Tenant, identity, and authorization

- Covers account activation/onboarding, Fund creation, canonical tenant login, and dashboard entry.
- Uses independent browser contexts for two Funds and denies copied-session, URL, resource-ID, API, Deal, Diligence, and LP Portal crossover.
- Protected APIs reject anonymous callers, hostile origins, malformed bodies, and invalid public tokens without disclosing Fund identity.

### 5. Mail, notifications, and public workflows

- Verifies notification preference persistence.
- Exercises signed inbound mail, idempotent replay, wrong-Fund routing, invalid signatures, and unsafe attachment failure paths.
- Covers the explicit no-delivery/copy-link expert invitation path when external delivery is disabled.
- Covers the public Contact boundary without claiming an email was delivered when delivery opt-in is off.

### 6. Main application surfaces

- Traverses every enabled primary GP navigation route and checks for meaningful rendering and runtime/network failures.
- Covers platform and tenant landing separation, Auth validation/keyboard login, safe redirect handling, and LP Portal allow/deny paths.
- Includes operational pages, expert management, desktop navigation, and representative mobile behavior.
- Every browser test fails on unexpected page errors, console errors, first-party request failures, or first-party HTTP 5xx responses.

## Capability-aware limits

- The runner provisions a loopback-only deterministic Ollama-compatible provider for the disposable Fund and drives the real Research/Memo worker interfaces. This proves orchestration and persistence, not production-model content quality.
- The runner provisions a loopback-only Resend-compatible provider and proves provider acceptance plus a signed inbound expert reply. Delivery to the public internet remains disabled unless explicitly opted in, so no external delivery claim is made.
- Four Vitest integration files remain intentionally environment-gated.
- Repository-wide `npm run lint` and the normal lint-gated build remain affected by inherited lint debt. Changed-scope checks, TypeScript, production compilation, and route generation pass.
- The generic background-job Cron is explicitly dynamic, so production builds no longer evaluate the dispatcher during static generation.
- The dependency audit still reports inherited production advisories; remediation is outside this E2E change.

## Automation and evidence

- Runner: `scripts/e2e/run-comprehensive.mjs`
- Playwright configuration: `playwright.config.ts`
- Browser scenarios: `tests/e2e/`
- Latest-run index: `.harnesskit/evidence/comprehensive-site-e2e/run-manifest.json`
- Immutable HTML, machine, capability, and fixture reports: follow the `artifacts` paths in the latest-run index under `.harnesskit/evidence/comprehensive-site-e2e/runs/<run-id>/`
- Verification summary: `.harnesskit/evidence/comprehensive-site-e2e/verification.md`
- OpenSpec tasks: `openspec/changes/add-comprehensive-site-e2e/tasks.md`
