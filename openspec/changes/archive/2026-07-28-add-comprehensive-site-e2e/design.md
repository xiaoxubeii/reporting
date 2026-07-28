## Context

The application currently relies on Vitest contracts, SQL checks, and feature-specific browser evidence. These checks prove individual boundaries but do not provide a repeatable user-interface acceptance run across the whole product. The requested suite crosses tenant Host routing, Supabase Auth and persistence, Miniflux, SearXNG and direct Search adapters, Cron/background jobs, model-backed research, public expert collaboration, email providers, and notifications.

The suite must run against disposable local data, preserve production-like authorization, and leave enough evidence to distinguish a test defect from a product defect or unavailable external dependency. Product defects discovered during execution are part of this change and must be fixed at the owning boundary rather than hidden with mocks or test-only shortcuts.

## Goals / Non-Goals

**Goals:**

- Provide one durable Playwright-based suite and command that drives the real external Web entrypoint and real UI controls.
- Cover the complete requested matrix: tenant registration/onboarding, every Search adapter and source class, Feeds subscription/discovery/intelligence, Pitch-to-Memo investment decisions, mail/notifications, and a risk-based primary-navigation sweep.
- Provision unique disposable identities, Funds, content, and integration state; prove cross-Fund denial and clean up what the test creates.
- Record structured step outcomes plus traces/screenshots on failure, and fail on unexpected page errors, console errors, or failed first-party requests.
- Reproduce and repair each in-scope product defect, add a focused regression test, and rerun the browser scenario through the intended architecture.

**Non-Goals:**

- Sending real money, changing production data, weakening authentication, bypassing RLS/Host authority, or embedding secrets in the repository.
- Declaring third-party Internet availability a product success; external outages are reported distinctly and only accepted when the UI exposes the designed partial/degraded state.
- Replacing focused unit, integration, SQL, security, or provider-contract tests.
- Completing unrelated legacy lint or dependency-audit debt unless it directly blocks or is caused by this suite.

## Decisions

### Use Playwright as the durable runner

The suite will use `@playwright/test`, typed fixtures, stable semantic locators, and reusable workflow helpers. Playwright is preferred over a shell transcript because it provides assertions, parallel-safe browser contexts, request/console observation, trace/video/screenshot artifacts, HTML/JSON reports, and CI portability. Existing `agent-browser` remains useful for interactive diagnosis, but it is not the committed acceptance runner.

### Execute through the real architecture path

The runner starts or targets the application through `devctl.sh`, opens the actual tenant/platform URLs, and uses visible controls. Direct database/service-role operations are limited to disposable fixture setup, environment assertions, external-event injection that cannot originate from a browser (for example signed inbound webhooks), and cleanup. They cannot be used to skip a product step or manufacture a passing end state.

### One serial scenario graph with isolated browser contexts

The core workflows form a dependency graph rather than independent demos: tenant creation establishes Host authority; Search and Feeds can create Deal signals; the investment flow produces Diligence, expert evidence, Memo, mail, and notifications. The primary acceptance project therefore runs serially with a unique run ID, while negative cross-tenant and responsive checks use separate contexts. This reduces flakes and preserves provenance across the journey.

### Explicit dependency capabilities and outcomes

Before each group, the harness records whether Supabase, Web/Cron, Miniflux, SearXNG, AI, and mail delivery are configured and reachable. A required configured dependency failing is a test failure. An intentionally unconfigured optional provider must be exercised through its documented degraded/fail-closed UI and recorded as such; the suite must not silently skip it.

### Adapter-complete Search matrix

The harness derives the code-reviewed adapter registry from the running product contract and executes representative queries for each enabled source/adapter from the UI. Assertions cover source provenance, result actions, partial failures, unsafe URL rejection, and tenant/category authorization. This prevents a hard-coded list in the test from drifting from the application registry.

### Evidence and cleanup are first-class

Every run writes a machine-readable manifest containing run ID, environment capabilities, scenario status, created resource IDs, and artifact paths. Failure retains trace, screenshot, video, console, page-error, and first-party failed-request evidence. Cleanup is idempotent, bounded to the generated run marker, validates all state-file paths, and executes even after failures.

### Product fixes require regression layering

For each real failure: capture the browser evidence, narrow the failing contract, add a focused RED regression where practical, implement the smallest architecture-correct fix, run targeted checks, then rerun the exact browser journey. Authorization, tenant, mail, URL, secret, and external-input fixes additionally receive a security review.

## Risks / Trade-offs

- **External adapters and model providers are nondeterministic** → Assert protocol, provenance, safety, and designed degraded behavior rather than exact third-party rankings or prose; retain response diagnostics without secrets.
- **A full serial investment workflow can be slow** → Use dependency-aware groups and reusable authenticated state, but never bypass required UI transitions; allow targeted scenario selection for diagnosis while the release gate always runs the full graph.
- **Email delivery may be unavailable locally** → Test real provider delivery when configured and the documented fail-closed/copy-link path when not configured; signed inbound webhook injection remains an integration boundary, not a replacement for UI assertions.
- **Fixture cleanup could delete unrelated data** → Require localhost Supabase, generated run IDs, restrictive state paths, ownership checks, and explicit resource IDs before deletion.
- **Current repository-wide lint debt can obscure results** → Run changed-scope lint and preserve the baseline comparison while still running TypeScript, full Vitest, build without lint, HarnessKit checks, and the complete browser suite.
- **Existing UI lacks stable test IDs** → Prefer roles, accessible names, labels, and visible text; add test IDs only where no stable user-facing contract exists.

## Migration Plan

1. Land the test runner, fixture contract, reports, and documentation without enabling it as an unconditional CI gate.
2. Run locally against an isolated dependency stack, repair discovered failures, and stabilize the full matrix.
3. Add an opt-in CI job with secrets/capability gates and artifact retention.
4. Promote it to a required release/merge gate only after repeated clean runs and documented runtime requirements.

Rollback removes the E2E-only runner/configuration and CI wiring. Product fixes remain independently covered by focused regression tests and can be reverted individually if necessary.

## Open Questions

- Which live mail and AI provider credentials are available in each execution environment will be discovered and recorded at runtime; the suite defines both configured and intentionally-unconfigured acceptance paths.
- CI concurrency and retention defaults will be finalized after measuring the first complete local run.
