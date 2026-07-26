# Feed Discovery Verification

## Outcome

The `add-feed-discovery` change is implemented on `codex/add-feed-discovery`, based on committed `main` HEAD `4f89c6b`.

The production path is:

1. Croner calls authenticated `GET /api/cron/feeds-discovery`.
2. The refresh runtime incrementally reads the deployment-owned Explore Miniflux account only.
3. Semantic enrichment and the independently versioned Deal classifier write service-role-only immutable rows.
4. Deterministic Trending and evidence-gated Deal Signal strategies stage one generation and atomically publish it as the last-known-good result.
5. Authorized Feeds users read the active generation through `GET /api/feeds/explore/discovery`.
6. Authorized Dealflow writers can confirm the existing `/api/deals/manual` flow from a personal article, Explore article, or eligible Deal Signal.

No fund Thesis personalization was added.

## Automated verification

- `npm test`: 202 files passed, 3 skipped; 1,525 tests passed, 5 skipped.
- `npx tsc --noEmit`: passed.
- Discovery/provider changed-scope `npx eslint`: no new diagnostics. The wider modified-file command still reports six pre-existing `no-explicit-any` findings in untouched Anthropic lines plus three existing `next/image` advisory warnings on feed image elements.
- `npx next build --no-lint` with non-secret verification placeholders for the required Supabase variables: passed, including `/api/cron/feeds-discovery` and `/feeds`.
- `npx openspec validate add-feed-discovery --strict`: passed.
- English, Simplified Chinese, and HarnessKit JSON parsing: passed.
- `git diff --check`: passed.
- actual Croner Node entrypoint test exercises `--run feeds-discovery`, bearer authentication, and the fixed route; refresh tests cover lease/idempotent counters, run caps, partial failures, reuse, and publication switching.
- migration security tests verify service-role-only grants, RLS, bounded payloads, and function ownership.
- regression tests verify source-reference and complete-generation count/byte bounds, fixed-length Deal Signal keys, retry-safe ID/change watermarks with a persistent scan cutoff, and stale UI response suppression.

## Fund-owned Provider verification

- Discovery has no configured or request-selected fund. Authenticated reads derive `fundId` from the current user's verified fund membership; scheduled jobs carry the eligible fund ID in signed, persisted background-job context.
- Every refresh resolves only that execution fund's current encrypted default provider settings. There is no first-configured-fund or Anthropic fallback. The existing Custom AI Provider is represented by the OpenAI-compatible `openrouter` settings fields and supports an arbitrary validated HTTPS Base URL, model, and bounded non-secret request parameters.
- API keys remain encrypted in `fund_settings`. No fund ID, provider key, model, or Discovery-specific provider is copied into environment variables or evidence.
- A secret-free SHA-256 fingerprint of fund ID, provider, model, validated Custom Base URL, and bounded request parameters versions semantic/classifier cache rows. Key rotation alone does not invalidate cache; behavior changes reset only the resumable scan while the active last-known-good generation remains visible.
- Provider calls receive the refresh deadline through `AbortSignal`, including Anthropic, OpenAI/OpenAI-compatible, and Gemini adapters.
- Focused provider/config/refresh/tagger/classifier/migration verification passed, including direct OpenAI, Anthropic, and Gemini SDK cancellation forwarding tests.
- The real authenticated page at `http://localhost:3220/feeds?view=explore&exploreView=trending` returned HTTP 200 from the unmocked discovery API and rendered the current safe empty state. Evidence: `custom-provider-empty-state.png`.
- A real refresh used the current local Supabase, deployment-owned Miniflux collector, and the authenticated user's fund Custom Provider. It scanned 100 articles, persisted 12 enrichments, retained 88 retryable failures, and stopped at `work_limit` without replacing the active generation with incomplete data.
- Review hardening prevents a changed article from joining to a stale Deal classification by checking both enrichment ID and content hash. Materialization now pages beyond 5,000 enrichment rows, fails closed above the explicit 50,000-row safety bound, and queries classifications only for the current eight-day target set in bounded 100-ID batches.
- The publish RPC now atomically checks the lease's exact semantic/classifier versions. An isolated PostgreSQL 18 run proved the service role cannot execute the old unfenced overload, can execute the new fenced overload, and cannot switch the active generation with stale versions.
- Final correctness/security re-review found no remaining MEDIUM, HIGH, or CRITICAL issue after these fixes.
- Current `npx next build --no-lint` passed through compilation, type validation, all 264 static pages, build traces, and route generation. The normal `next build` remains stopped by proven repository-wide pre-existing ESLint debt; current TypeScript, strict OpenSpec, complete Vitest, database assertions, and `git diff --check` pass.

## Database verification

The new migration was applied independently to a temporary PostgreSQL 18 container with `anon`, `authenticated`, and `service_role` roles. `supabase/tests/feed_discovery.sql` passed, including:

- no anonymous or authenticated reads;
- service-role table/function access;
- singleton lease ownership;
- atomic active-generation switching;
- failed generations preserve the previous active generation;
- sanitized failure state;
- durable changed-entry ID cursor plus fixed scan cutoff, including a low-ID change that occurs between continuation runs;
- empty-generation publication.

The temporary container was stopped and removed.

The final provider-version fencing assertions were also rerun from a clean PostgreSQL 18 container after review hardening; the disposable container was stopped and removed. A mistakenly repeated isolation script against the shared local database created one fixed-ID QA result; that single confirmed test row was deleted and the Discovery-only scan singleton was reset. No real enrichment/classification rows or personal Miniflux data were removed.

The repository-wide `npx supabase start` bootstrap is currently blocked before this migration by the pre-existing `20260312100002_compliance_seed.sql` row `insurance-eo`, whose null `regulation_url` violates the existing not-null constraint. This change does not edit that unrelated baseline migration.

## Authenticated browser verification

Command: `node .harnesskit/evidence/add-feed-discovery/browser-verify.mjs` with the existing local environment and the worktree dev server at `http://localhost:3210`.

The test uses a short-lived magic-link session for the existing test account, revokes it in `finally`, and intercepts only discovery fixtures, Explore article fixtures, the manual Deal response, and the unrelated vehicle-index probe. It exercises the real authenticated Next.js page, controls, dialogs, responsive layout, and navigation without writing fixture data into the shared database.

Verified flows:

- desktop Trending metrics, stale last-known-good state, and source dialog;
- desktop Deal Signals, evidence, plain-text rendering of instruction-like content, and Deal prefill;
- user-confirmed manual Deal submission response and Deal-detail navigation;
- ordinary Explore article reader and title/link/summary/body Pitch prefill;
- discovery empty and error states;
- mobile Deal Signals layout;
- dialog keyboard close/focus behavior and accessible reader title/description;
- zero unexpected console errors, page errors, failed requests, or HTTP errors.

Screenshots:

- `trending-desktop.png`
- `deal-signals-desktop.png`
- `deal-signal-prefill.png`
- `article-prefill-desktop.png`
- `deal-signals-mobile.png`

## Residual deployment requirements

- Apply `20260725020000_feed_discovery.sql`, `20260726010000_feed_discovery_provider_version_rescan.sql`, `20260726020000_feed_discovery_fund_scope.sql`, and `20260726030000_feed_discovery_scheduler_cursor.sql` in the target environment.
- Configure each fund's default provider through the existing Settings UI. Discovery has no separate provider, model, key, or fund environment variable.
- Configure the existing Explore Miniflux collector identity.
- Keep Croner configured with the existing server-only `CRON_SECRET`; each `feeds-discovery` invocation atomically claims one bounded, round-robin batch of eligible funds and enqueues signed system jobs whose persisted context supplies `fundId` to the worker.
- Repository-wide lint debt remains outside this change; the changed files have no lint errors.

## Fund-scope correction verification (2026-07-26)

- Removed `FEED_DISCOVERY_AI_FUND_ID` from runtime and local/example configuration. Provider resolution now requires the verified route or background-job fund ID and reads only that fund's encrypted default provider/model settings.
- Added `fund_id` to enrichments, classifications, generations, and refresh state. Repository, runtime, cleanup, materialization, publication, and reads are constructor-bound to one validated fund. Classification uses a composite `(fund_id, enrichment_id)` foreign key.
- Replaced deployment-global RPC overloads with service-role-only fund-scoped claim/finish/publish functions. The forward migration takes an `ACCESS EXCLUSIVE` lock before deleting provenance-free derived rows, preventing legacy workers from racing the `NOT NULL` schema transition.
- Replaced direct Cron refresh with a persisted, service-role-only round-robin cursor that claims at most 100 eligible funds per invocation. The worker rejects body/query authority and obtains the fund only from a signed, persisted background-job context.
- Isolated PostgreSQL execution passed the forward migration and two-fund SQL assertions. The same collector article can be cached by two funds, cross-fund classification references fail, leases are independent, and Fund A publication does not switch Fund B's generation.
- The migration was applied to the current local database after backing up the four derived tables inside `supabase-db:/tmp/reporting_feed_discovery_before_fund_scope_20260726.dump`. It removed 100 provenance-free enrichments and one global refresh-state row; Miniflux articles were not modified.
- A real refresh for authenticated `test@example.com` resolved its membership fund and that fund's Custom Provider/model without a configured fund ID. It scanned 100 articles, persisted 12 enrichments, and safely retained 88 retryable failures; the incomplete run did not publish a generation.
- The real authenticated Trending page now renders `No topics are trending yet`; the normal Discovery request returns HTTP 200 instead of the prior 500/error state, while an attempted `fundId` query override for another fund returns HTTP 400.
- Full Vitest passes 202 files / 1,525 tests with five environment-gated tests skipped. TypeScript, changed-scope ESLint, strict OpenSpec, SQL assertions, and `git diff --check` pass. Production compilation succeeds, then the normal build remains blocked by existing repository-wide ESLint debt outside this change.
