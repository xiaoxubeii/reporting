# Comprehensive site E2E verification

Date: 2026-07-28
Branch: `feature/comprehensive-site-e2e`
Worktree: `/home/ubuntu/workspace/reporting.worktrees/comprehensive-site-e2e`

## Passing evidence

- `npm run test:e2e`: 29/29 passed in the final post-lint-repair 10.0 minute serial desktop/mobile Chromium run, with 0 failed, skipped, timed out, interrupted, flaky, or unexpected results. Latest run ID: `8915cb33-2421-42b1-b0d9-06b0d10917de`.
- `npm test`: 338 files and 2,280 tests passed; 4 files and 8 environment-gated tests skipped.
- Final security and decision-integrity regression: 8 files and 28 tests passed, covering atomic promotion, final-decision gates, inbound body limits, public upload/rate-limit boundaries, webhook admission, and fixture cleanup.
- Pitch attachment fail-closed regression: 4 files and 18 tests passed. Manual and public Pitch files are content-scanned before persistence; partial storage or metadata failure rolls back every written object, records failure, returns HTTP 500, and never continues to Deal processing.
- Final independent code re-review confirmed both Pitch attachment findings are resolved and reported no remaining CRITICAL/HIGH findings in this change.
- `npx tsc --noEmit`: passed.
- `./.harnesskit/scripts/verify-fast.sh`: passed after the feature-state contract was updated.
- Focused Pitch-to-Diligence and complete Pitch-to-decision journeys passed after each repair.
- Changed-source ESLint passed for all 176 changed JavaScript/TypeScript source files with `--max-warnings 0`; `git diff --check`, secret pattern scan, and bootstrap-marker scan passed.
- `npx next build --no-lint`: production compilation, type validation, page-data collection, and 276-page generation passed. The background-job Cron is explicitly dynamic and is no longer evaluated during static generation.
- `openspec validate add-comprehensive-site-e2e --strict`: passed.
- Real create/cleanup cycle passed; all six latest-run Fund, LP, member, viewer, and onboarding fixture cleanup records are `passed`.

## Browser journeys

- Search exercises its configured live source contract, provenance and safe empty/partial-failure behavior, including recovery when personal Feeds authentication is lost.
- Feeds provisions/reprovisions a managed identity, follows a curated source into a new folder, opens discovery views, enforces Fund isolation, refreshes Explore, and confirms a Feed-to-Deal handoff.
- A uniquely tagged public Pitch creates exactly one Fund-scoped source email and Deal, runs queued/Cron Research to a truthful terminal state, atomically promotes once to Diligence, and uploads/ingests evidence.
- A manual Deal remains durable when AI is unavailable; concurrent promotion returns one success and one idempotent conflict with the same Diligence ID.
- The complete decision journey creates/invites an expert, submits the public answer idempotently, materializes and re-ingests the evidence, applies the Fund checklist, records all seven scoring dimensions, rejects an empty recommendation, preserves 114 unresolved gaps, finalizes once, and then allows `Passed`.
- Canonical Fund onboarding/login succeeds; copied and independent Fund sessions cannot read or mutate the other Fund's pages, APIs, Deals, Diligence, or LP portal.
- The local Resend-compatible round trip records provider acceptance and a signed inbound expert reply; duplicate/invalid/wrong-Fund/unsafe attachment boundaries, external no-delivery opt-in enforcement, all enabled primary GP routes, public/auth/LP surfaces, desktop, and mobile navigation pass.
- Every test fails on unexpected page errors, console errors, first-party request failures, or first-party HTTP 5xx responses.

## Known inherited or external limits

- `npm audit --omit=dev --audit-level=high` reports 19 advisories in inherited production dependencies (15 high, 4 moderate), including Next.js and `xlsx`; this branch adds only Playwright as a dev dependency. Several suggested remediations are breaking upgrades and `xlsx` has no registry fix, so dependency remediation is intentionally kept out of this E2E change.
- Normal `npm run build` and `npm run lint` stop at inherited repository-wide ESLint debt; production compilation succeeds with the documented lint gate disabled, and all 176 changed source files have zero ESLint diagnostics.
- A loopback-only deterministic Ollama-compatible provider drives the real Fund-scoped Research/Memo execution interfaces. The suite verifies orchestration, state, provenance, and retry behavior, but does not claim production-model content quality.
- A loopback-only Resend-compatible provider drives the Fund mail round trip. Public-internet delivery is opt-in and disabled for this run; no external email delivery is claimed.
- The authoritative latest-run index is `run-manifest.json`; its `artifacts` fields resolve immutable reports under `runs/8915cb33-2421-42b1-b0d9-06b0d10917de/`. Legacy root-level result files are not authoritative.
