# Investment flow read-only audit: OpenSpec tasks 5.2–5.5

> Status: pre-repair audit snapshot. The findings below describe the code at audit time; final remediations and verification are recorded in `verification.md` and `results.json`.

Date: 2026-07-27
Worktree: `/home/ubuntu/workspace/reporting.worktrees/comprehensive-site-e2e`
Branch/HEAD: `feature/comprehensive-site-e2e` / `550cb1a7eddf6f9663f13b436d3d3709bcb4388e`
Mode: read-only code, evidence, fixture, and local-capability audit. No browser journey was run, no service was started, and no database or product/test source was changed.

## Executive conclusion

Tasks 5.2–5.5 are correctly still unchecked. The current comprehensive suite proves Pitch creation, Deal creation, Deal Research enqueue, atomic promotion, and one document upload, but it does not prove any live AI-backed terminal Research, Diligence ingestion/research, expert public response/materialization, checklist assessment, scoring, Memo review/finalization, or final investment decision.

The missing coverage cannot be closed honestly by merely extending the existing Playwright test:

1. The disposable Fund has no usable Fund-scoped AI configuration and explicitly sets Diligence web search off.
2. The runner reuses a shared local Supabase, while the Memo Agent Cron worker claims the oldest pending job globally across all Funds. Running 5.3–5.4 on that database could process unrelated pre-existing jobs.
3. Fixture cleanup deletes Fund/auth rows but does not delete objects written to the private `diligence-documents` bucket.
4. Several product routes do not enforce the OpenSpec ordering/gates. In particular, any Fund member can set the Diligence Deal to `invested` or `passed` before Research, scoring, recommendation, or Memo finalization, and Memo finalization checks only for a non-placeholder recommendation.

Therefore the safe completion path is: use a truly isolated local Supabase/storage stack; provision a real Fund-scoped AI provider without copying another Fund's encrypted state; drive all terminal states through UI/API/Cron; retain missing evidence as missing; and add negative browser coverage for the missing server-side gates before marking 5.2–5.5 complete.

## Evidence status and local capabilities

### Current read-only snapshot

- `./devctl.sh status` reported Web and Cron stopped for this worktree.
- External Supabase (`http://127.0.0.1:8000`), Miniflux (`:8085`), and SearXNG (`:8086`) were reported running.
- Local Chromium and the Supabase/Miniflux credentials required by the existing runner are available according to the last redacted capability record.
- The last `.harnesskit/evidence/comprehensive-site-e2e/capabilities.json` was generated at `2026-07-27T10:16:31.033Z` during a prior run. At that time Web/Cron were running, AI was `unconfigured`, platform mail was `configured`, and Fund mail encryption was `unconfigured`.
- `platformMail: configured` only means a process-level mail environment variable exists. Expert invitation delivery calls the Fund-scoped outbound provider configuration, so this does not prove that the disposable Fund can send mail.
- The capability probe checks process environment names for AI, but the audited AI execution paths load encrypted API credentials from the disposable Fund's `fund_settings`. A future `providers.ai: configured` result can therefore be a false positive unless the probe also verifies the actual Fund-scoped provider used by the fixture.

### Durable evidence mismatch

- `.harnesskit/evidence/comprehensive-site-e2e/verification.md` says the 11-test suite passed twice.
- The current machine-readable `results.json` contains only the later focused `platform-smoke.spec.ts` run (one passing test). A focused run overwrote the full-run JSON, so the committed narrative and current machine report do not describe the same run.
- Historical `.harnesskit/evidence/investment-decision-e2e/results.md` records a successful 2026-07-24 workflow on another branch/worktree after aligning its Fund to an existing working AI configuration. It is useful diagnostic evidence, but it is not repeatable proof for this change: no screenshots/traces were retained, it used a different fixture/configuration, and it stopped with an unfinalized Memo and no final decision.
- Historical `.harnesskit/evidence/investment-decision-e2e/cardiosignal-e2e-memo.md` is a derived prior-run artifact. It must not be uploaded as source evidence in the new E2E, because doing so would turn a generated conclusion into its own input provenance.

### Existing disposable test data

- `scripts/investment-e2e-fixture.ts` creates two unique local-only users/Funds, admin memberships, public submission tokens, and Fund settings.
- It enables Deal intake and Deal Research, but emits `provider: "unconfigured"`, does not install an encrypted Fund AI key, and sets `memo_agent_web_search_enabled: false`.
- `tests/e2e/investment-flow.spec.ts` submits a unique Cardio Signal pitch and uploads `tests/e2e/fixtures/cardio-signal-pitch.txt`. That file contains three concise, explicitly test-fixture claims. It is valid synthetic source material, but it is too thin to make most of the bundled 141-item checklist complete.
- `tests/e2e/experts.spec.ts` creates one Fund-confirmed expert with an `example.invalid` address. An extended investment test must not silently depend on that separate spec running first; targeted execution and Playwright file ordering can omit it. The investment journey should create or fixture-own its expert in the same scenario graph.
- Promotion through `promote_inbound_deal_to_diligence` does not seed the default checklist. Manual Diligence creation does, but Deal promotion does not. The E2E must explicitly use the Checklist UI's “apply Fund default” action and verify the resulting items.

## Real architecture path

```text
Public Pitch UI
  -> POST /api/public/submit/:token
  -> inbound_emails / inbound_deals
  -> authenticated Deal detail
  -> POST /api/deals/:id/research
  -> background_jobs(kind=deal_research)
  -> Cron GET /api/cron/background-jobs
  -> tokenized POST /api/internal/background-jobs/deal-research/run
  -> inbound_deals research projection
  -> status change / POST /api/deals/:id/promote-to-diligence
  -> promote_inbound_deal_to_diligence RPC
  -> Diligence UI
  -> document upload
  -> POST /api/diligence/:id/agent/ingest
  -> memo_agent_jobs -> Cron GET /api/cron/memo-agent-worker
  -> ingest -> ingest_synthesis -> optional checklist_assessment
  -> POST /api/diligence/:id/agent/research
  -> Research gap/contradiction
  -> expert request -> select -> invite
  -> public /expert-response -> submit
  -> immutable industry_expert storage/document materialization
  -> incremental ingest -> ingest_synthesis -> checklist assessment
  -> optional explicit Research rerun
  -> score -> draft -> draft_review + score
  -> partner edits recommendation / resolves or explicitly handles attention
  -> POST /api/diligence/:id/drafts/:draftId/finalize
  -> PATCH /api/diligence/:id deal_status=passed|invested
```

Direct database writes must not manufacture any state on this graph. Read-only postcondition queries are useful for invariants not exposed by the UI, but the terminal projection itself must be produced by the route/Cron/worker path.

## Task 5.2: Deal Research and exactly-once promotion

### Actual path and terminal states

1. The Deal detail button calls `POST /api/deals/:id/research`.
2. `queueDealResearch` checks Fund scope and `deal_research_enabled`, then creates `background_jobs(kind='deal_research')` with dedupe key `deal_research:<dealId>` and projects `research_status='pending'`.
3. Cron's `background-jobs` job runs every ten minutes, claims up to three jobs, issues a short-lived attempt token, and calls the internal Deal Research worker.
4. The worker validates the token/attempt/Fund/deal, projects `running`, invokes the Fund's `deal_analysis` provider with the bounded `reporting_search` tool, and writes only while the lease remains active.
5. Honest terminal states are:
   - `done`: at least one successful Search call, at least one collected source, valid JSON, and only known evidence source IDs.
   - `skipped`: unsupported tool-loop provider, no successful Search call, or no independent evidence.
   - `failed`: invalid grounded result, worker failure after retries, expired lease, or revoked authority.
6. Promotion calls `POST /api/deals/:id/promote-to-diligence`, whose advisory-lock RPC creates exactly one Diligence row and returns the same ID with HTTP 409 to a competing/repeated promotion.

### AI, Search, and timing dependencies

- Deal Research requires a real Fund-scoped AI provider that supports tool loops. Ollama and providers without `createToolLoop` intentionally end as `skipped`.
- It also requires the product Search boundary to return at least one safe independent source. Miniflux/SearXNG being up is not sufficient if the AI provider is absent.
- The current disposable Fund has no encrypted AI credential, so the default path cannot reach `done`.
- The route does not kick the dispatcher. The first attempt can wait for the ten-minute Cron schedule; retries add 15/30/45-second availability delays but are still only noticed on a later Cron tick. The current 90-second Playwright timeout is not suitable for this terminal path.

### Honest E2E terminal proof

- Use a stable public company/domain as the external search subject and carry the unique E2E marker in a separate pitch field/description. A wholly fictional `*.example` company is expected to produce “no independent evidence,” not grounded success.
- If no live provider is available, assert the designed `skipped`/`failed` UI honestly and keep 5.2 incomplete; do not insert `research_sources` or change `research_status` directly.
- When configured, poll the authenticated Deal API/UI until `done|skipped|failed`, then assert source titles/URLs are safe and visible, error text is explicit, and the completed `background_jobs` row belongs to the same Fund/deal/actor.
- Exercise rejection/recovery by changing Deal status through visible controls, reloading, and confirming the source Pitch/Deal remains durable. The current UI has status changes but no dedicated status-history surface, so “history” cannot presently be proven from the real UI.
- Promote only after recording the Research terminal outcome, then assert one `promoted_diligence_id`, one Diligence detail URL, and a repeated/concurrent promotion returning the same ID.

### Repeat/failure behavior already present

- Two active Research enqueue requests converge on one active job (`already: true`) through a database unique partial index.
- A terminal rerun creates a new job and overwrites the Deal's current Research projection. Completed jobs retain backend history, but the Deal UI shows only the latest projection.
- Retryable worker HTTP statuses retry up to three attempts; stale attempts cannot overwrite a newer lease.
- Concurrent/repeated promotion returns one 200 and one 409 with the same Diligence ID. This is already covered in `tests/e2e/investment-flow.spec.ts` and `tests/deal-promotion-atomicity.test.ts`.

### Gaps and product risks

- **High — promotion is not evidence-gated.** The current E2E clicks Research and immediately promotes while Research is still pending. The promotion route accepts pending, failed, skipped, or never-run Research, violating the incomplete-action requirement if Deal Research is a required predecessor.
- **High — no durable UI Research history.** Reruns overwrite the projection and the page displays no prior attempts/sources/outcomes, so task 5.2's “history” is not browser-verifiable.
- **Medium — the Deal Research card does not poll.** After enqueue it remains visually pending until reload/navigation even if the worker finishes.
- **Medium — current E2E assertion is enqueue-only.** It asserts HTTP 200 and a “Researching…” label, not a terminal status, source grounding, retry, recovery, or stale-attempt fencing through the live path.

## Task 5.3: Diligence ingestion/research, expert response, materialization, and re-ingestion

### Diligence ingestion and Research path

1. Upload through the Data Room UI creates a private storage object and `diligence_documents` row.
2. “Analyze data room” calls `POST /api/diligence/:id/agent/ingest`, which rejects another in-flight job, enforces cost caps, and creates a Memo Agent `ingest` job.
3. The Memo Agent worker parses up to eight documents per ingest job, calls the Fund AI provider per document, writes claims with document/checklist provenance, and chains continuation jobs as needed.
4. The final batch creates `ingest_synthesis`; synthesis produces cross-document gaps/contradictions and optionally enqueues checklist assessment if checklist items already exist.
5. Diligence “Run Research” requires a mutable draft with `ingestion_output`, then runs three AI subcalls for claims, competitors, and founders.
6. True external Diligence research is available only when the Fund opts in and the resolved research-stage provider is Anthropic. The current fixture explicitly turns this off, so even a configured non-Anthropic/default run is `research_mode='no_web_search'`.

### Expert validation path

1. The UI exposes expert validation only for a persisted, non-dismissed Diligence Research `research_gap` or `contradiction`. Without Diligence Research output there is no valid source to attach a request to.
2. AI-assisted question/profile/context generation requires the Fund AI provider, but it is not logically required: when generation fails the fields remain editable and a human can enter bounded values manually.
3. A Fund-confirmed or platform-certified expert must be selected. Embedding auto-match is optional; manual directory selection is the supported fallback.
4. Invitation issues/rotates a hashed token before attempting email. With no Fund mail provider it returns HTTP 202, a copyable same-Fund link, and a warning. Thus 5.3 does not require real email delivery; task 6.3 separately owns the configured delivery path.
5. The expert answer must be entered through the public `/expert-response#token=...` UI. Repeating the same valid submission returns the original submission time and does not change the stored response.
6. First submission calls `materializeExpertResponse`: it writes immutable Markdown at `<dealId>/expert-validation/<requestId>.md`, creates/reuses exactly one private `diligence_documents` row of detected/source type `industry_expert`, links it once to the request, and atomically requests an incremental ingest.
7. Incremental ingest merges that document into the existing mutable draft, runs synthesis, and can run checklist assessment. Diligence Research is intentionally not rerun automatically; the E2E must explicitly click “Re-run Research” if the Memo should incorporate a refreshed external analysis of expert evidence.

### AI and mail requirements

- Ingestion, synthesis, Diligence Research, expert-generation assistance, checklist assessment, scoring, draft, and review all require a real Fund-scoped AI provider.
- Expert request creation can use human fixture text, but it still needs a real Research source record. Creating a fake request directly in the database would lose the source-ref contract and is not acceptable.
- Expert invitation and public submission can complete with the copy-link fallback and do not require email.
- The current expert uses `example.invalid`; configured-provider delivery should not be claimed from a provider acceptance unless a controlled test inbox/sink is supplied and delivery is observed.

### Honest E2E terminal proof

- Apply the default checklist before ingestion so claims can carry real checklist IDs and synthesis can auto-enqueue assessment.
- Upload only source fixtures authored as synthetic input, not a prior generated Memo or output snapshot.
- Wait through `ingest -> ingest_synthesis -> checklist_assessment` by polling `/api/diligence/:id/agent/status` and actual outputs. Do not mark the stage complete from `current_memo_stage`; the code itself documents that field as a pointer, not completion evidence.
- Assert each ingested claim refers to the uploaded document ID and that deliberately absent clinical/commercial evidence remains in gap lists.
- Run Diligence Research and require non-empty, source-bearing output for configured external mode. If web search is off, record `no_web_search` as a degraded path rather than external Research completion.
- Create/select/invite the fixture expert in the same serial scenario, open the returned public link in a fresh unauthenticated context, submit a clearly labeled synthetic human answer, and verify the authenticated panel shows `submitted`, one linked document, and `parsed`/settled evidence status after re-ingestion.
- Repeat the public submit and materialization API and assert the response timestamp, document ID, storage path, artifact count, and active ingest dedupe do not duplicate.

### Repeat/failure behavior already present

- Another pending/running Memo Agent job for the same Deal causes ingest/research/checklist/score/draft enqueue routes to return 409.
- Incremental ingest returns a no-op when documents and checklist are already up to date.
- Invitation CAS semantics reject an ordinary second issue, allow explicit reissue only from `invited`, and invalidate the old token.
- Public invalid, wrong-Fund, expired, or superseded tokens return one generic 404 without disclosing request existence.
- Materialization reuses an identical immutable object and unique storage path; mismatched existing content fails instead of overwriting evidence.
- An already parsed expert document returns `enqueued: false, reason: 'already parsed'`.

### Gaps and product risks

- **Blocker — current Fund has no AI.** The present suite can upload the text file but cannot truthfully create ingestion, Research, checklist, score, or Memo output.
- **High — shared Memo Agent worker is not E2E-isolated.** `memo_agent_claim_next_job()` claims the oldest pending job globally, without a run/Fund filter. Starting Cron against shared Supabase can mutate unrelated Funds. A dedicated Supabase/storage instance is required before running these stages.
- **High — expert evidence can be stranded pending.** If public submission materializes while any Memo Agent job is active for the Deal, `enqueue_ingest_if_deal_idle` returns `enqueued:false`. The request is linked to a pending document without `materialization_error`, and the Expert panel's retry button is hidden when `documentId` exists. No later automatic retry is scheduled; only a manual Data Room analysis can recover it.
- **High — Diligence Research can look successful with no usable output.** Each of the three subcalls catches its own error, falls back to empty arrays, and the job still persists a non-null `research_output`. The progress model treats non-null Research as done even if every subcall failed or no findings/sources exist.
- **High — cleanup omits Storage.** Fund/database cascade does not delete Supabase Storage objects. The existing uploaded pitch file and future immutable expert Markdown can survive fixture cleanup as orphaned private objects.
- **Medium — checklist is not seeded by Deal promotion.** The atomic promotion RPC omits `seedDealChecklistFromFundDefault`; the E2E must apply it manually, and product behavior differs from manually-created Diligence Deals.
- **Medium — separate expert test is not a fixture contract.** A targeted investment-flow run has no guaranteed expert to select.

## Task 5.4: checklist, scoring, Memo review/recommendation/finalize, and decision

### Actual path and honest sequence

1. Checklist:
   - Apply the bundled/Fund default through the Checklist UI.
   - Ingest/synthesis auto-enqueues assessment only when items exist; otherwise call `POST /api/diligence/:id/agent/checklist-assessment` manually.
   - Terminal evidence is item-by-item `found|partial|missing|unknown|not_applicable` with document IDs and notes. `missing` is assessment coverage, not completeness.
2. Scoring:
   - `POST /api/diligence/:id/agent/score` needs ingestion but does not require Research, checklist completion, or a Memo.
   - Honest completion requires every rubric dimension to have a numeric score or explicit `partner_only` mode; low confidence and missing evidence must remain visible.
3. Memo draft/self-review:
   - `POST /api/diligence/:id/agent/draft` requires ingestion, creates outline/fill output, forces recommendation to a partner-only placeholder, and auto-enqueues `draft_review`.
   - `draft_review` attempts review and scoring independently. Review failure can still leave a scored first draft; the E2E must inspect warnings rather than treating job success alone as a clean review.
4. Partner recommendation:
   - Use the real inline Memo editor to replace the recommendation placeholder with an explicit human fixture judgment. With the deliberately incomplete fixture, a defensible terminal recommendation is “Pass / insufficient evidence,” not an invented investment approval.
   - Keep checklist gaps visible. Resolve attention items only by editing the Memo or deliberately marking them done/ignored; do not relabel missing checklist items as found.
5. Finalize:
   - Admin calls `POST /api/diligence/:id/drafts/:draftId/finalize`.
   - Verify the draft becomes immutable, `is_draft=false`, `finalized_at/finalized_by` are set, edits return 409, and the Memo still cites only real source IDs.
6. Decision:
   - The only current product decision action is `PATCH /api/diligence/:id` with `deal_status='passed'|'invested'` via the header dropdown. There is no separate decision entity, reason, author, decision timestamp, or linkage to the finalized draft.
   - For this fixture, choose `passed`, then verify the Diligence detail/index/analytics and source Deal lineage agree.

### Dependencies and runtime

- All automated checklist/scoring/draft/review stages need the Fund AI provider.
- No email is required for 5.4.
- The Memo Agent Cron runs every three minutes, while best-effort immediate kicks use the worktree's dynamically assigned Web origin. Multi-stage chains can exceed the current 90-second test timeout and need an explicit scenario timeout based on the real provider latency.
- The default checklist is approximately 141 items and assessment batches 25 items per AI call. This is intentionally slow and costly; assertions must be on provenance/status/count invariants, not exact prose.

### Product gate failures

- **Critical — final decision is not gated.** `PATCH /api/diligence/:id` uses `ensureMember`, not admin/partner authorization, and accepts `invested` or `passed` without a finalized Memo, recommendation, scores, Research, checklist, or evidence. This directly contradicts the repeated/incomplete action requirement.
- **High — finalization enforces only recommendation presence.** It does not reject a stale Memo, open `must_address` items, absent Research, absent/partial scoring, or missing/unknown checklist items. The progress UI can show a partial/blocked stage while the server finalizes it.
- **High — finalization and decision are separate, unaudited writes.** Finalizing a Memo does not record a decision, and changing `deal_status` does not link to the final draft or preserve decision rationale/actor history.
- **High — `invested` is inconsistent with analytics/API contracts.** The UI writes `invested`, but analytics count only legacy `won`; `/api/diligence` filtering also excludes `invested`. A successful “Invested” decision can disappear from won/funnel counts or cause `status=invested` to return an unfiltered list.
- **Medium — source Deal status does not follow the Diligence decision.** The promoted `inbound_deals` row remains `diligence` when the Diligence Deal becomes `passed` or `invested`, so the two visible lifecycle surfaces can disagree.
- **Medium — client status update is optimistic and ignores a failed response.** The Diligence header changes local state before checking the PATCH result.

### Current E2E gap

`tests/e2e/investment-flow.spec.ts` only verifies that the tabs render and can be selected. It does not apply/assess the checklist, wait for any Memo Agent job, inspect claims/citations/gaps, score, draft, review, edit recommendation, finalize, lock edits, select a decision, or verify analytics.

## Task 5.5: repeated and incomplete failure paths

The following matrix is the minimum browser/API evidence needed. “Current” describes audited behavior, not a passing acceptance assertion.

| Action | Required test | Expected safe result | Current behavior / gap |
|---|---|---|---|
| Research enqueue twice | Two near-concurrent authenticated POSTs | One active job; second returns same job as already queued | Implemented in queue/DB unit tests; not live E2E |
| Research invalid/no sources | Run through Cron/worker | Explicit `skipped` or `failed`; no fabricated sources | Implemented in worker code/tests; current fixture cannot run live |
| Promote while Research pending/failed | Try visible promotion | Must block if Research is required | Currently succeeds: product contract gap |
| Promote twice/concurrently | Two POSTs | One 200, one 409, same Diligence ID | Covered and passing |
| Ingest/research/score/draft while another job runs | Repeat button/API | 409 with active job ID; no duplicate job/output | Implemented; not browser-covered for these stages |
| Research before ingestion | Click/call Research | 409 “Run Stage 1 ingest first” | Implemented; not E2E |
| Score/draft before ingestion | Click/call | 409 with explicit prerequisite | Implemented; not E2E |
| Checklist assessment with no items | Click/call | 400, no output | Implemented; promotion makes this state likely |
| Expert invite twice | Invite, then ordinary invite again | CAS failure; explicit reissue is separate | Implemented; no comprehensive E2E |
| Reissue then use old token | Open old public link | Generic 404, no response mutation | Implemented; ideal no-DB-mutation expiry/supersession test |
| Expert submit twice | Repeat valid public POST | Same `submitted_at`, one stored response | Implemented in service/DB contract; no browser E2E |
| Materialize twice | Retry after first success | Same document/storage path; no duplicate artifact/job | Unit/contract coverage exists; no real storage/browser E2E |
| Materialize while another job is active | Submit expert answer during active job | Durable retryable state and later automatic/manual recovery | Current response can be stranded pending with no Expert-panel retry control |
| Finalize with placeholder/empty recommendation | Click finalize before partner edit | HTTP 422, draft remains mutable | Helper/route logic exists; no route/browser regression |
| Finalize twice | Repeat after success | HTTP 409, no timestamp/author change | Implemented; no E2E |
| Finalize with open must-address/stale/partial scoring | Attempt finalize | Must block or require explicit auditable override | Currently succeeds if recommendation is non-placeholder |
| Decide before finalization/recommendation/evidence | Choose Passed/Invested early | Clear blocking state, no decision write | Currently succeeds for any Fund member |
| Edit finalized Memo | Attempt paragraph/score edit | HTTP 409, immutable final snapshot | Implemented; no E2E |

## Existing focused coverage

Useful current regression layers include:

- Deal queue/grounding/worker: `lib/deals/research-queue.test.ts`, `lib/deals/research-worker.test.ts`, `lib/deals/research.test.ts`, `lib/deals/research-search-tool.test.ts`.
- Background authority/retry/fencing: `lib/background-jobs/*.test.ts`, `tests/background-job-migration-security.test.ts`, `tests/background-job-http-topology.test.ts`.
- Atomic promotion: `tests/deal-promotion-atomicity.test.ts` plus the concurrent browser assertion.
- Expert lifecycle/public/materialization: `lib/expert-validation/*.test.ts`, `tests/expert-validation-contract.test.ts`, and `scripts/test-expert-validation-db.sh`.
- Diligence progress semantics: `lib/diligence/progress.test.ts` correctly distinguishes assessment from completeness and open attention from a finished Memo.
- Recommendation helper: `lib/diligence/memo-finalization.test.ts` covers placeholder vs partner-authored text.

Important missing regression layers:

- No live Deal Research Cron terminal/browser test.
- No browser test for source/history/reload behavior.
- No current comprehensive public expert response/materialization/storage/re-ingestion journey.
- No route-level finalization test that authenticates admin/member roles and verifies immutable fields.
- No server test that blocks premature final decision, because the block does not exist.
- No analytics regression for the current UI value `invested`.
- No cleanup assertion for `storage.objects` under created Deal IDs.
- No isolation assertion that the E2E Cron worker cannot claim unrelated Memo Agent jobs.

## Safe execution gate before implementing 5.2–5.5

Do not run the extended investment E2E against the currently shared Supabase. First satisfy all of the following:

1. Provision a dedicated local Supabase/Postgres/Storage instance for the run, or add an architecture-level worker scope that proves unrelated jobs cannot be claimed. Merely tagging rows is insufficient while the worker claim RPC is global.
2. Extend cleanup to delete all created `diligence-documents/<dealId>/...` and render/transcript objects before deleting database identity, then assert zero owned rows and zero owned objects.
3. Configure the disposable Fund through the supported settings/fixture contract with its own encrypted provider credential. Do not copy another Fund's encrypted columns or point the fixture at pre-existing Fund data.
4. Make capability checks resolve the actual disposable Fund provider and actual expert mail path, not only process-level environment names.
5. Decide the required Research acceptance mode:
   - configured Anthropic + web-search opt-in for true external Diligence Research; or
   - explicit degraded `no_web_search`/`skipped` result that does not close the external-Research requirement.
6. Keep synthetic source provenance explicit. The public pitch, uploaded source file, and human expert answer are inputs; AI outputs and prior memos are never reintroduced as source evidence.
7. Poll real API/job artifacts until terminal, using scenario-specific timeouts. Never set `research_status`, Memo outputs, parse status, checklist status, finalization fields, or decision state directly.
8. Add/fix server-side gates for premature promotion/finalization/decision, then prove both the blocked and successful paths through the browser.
9. Persist one full-run machine report under a run-specific path so later focused runs do not overwrite the release evidence.

## Task disposition

- **5.2 — Not complete.** Enqueue and atomic promotion are proven; live terminal grounding, history, rejection/recovery, and evidence-gated promotion are not.
- **5.3 — Not complete.** Product code has a credible expert/materialization contract and a historical diagnostic run, but the current fixture has no AI, no self-contained expert dependency, no live public/materialization browser evidence, unsafe shared-worker scope, and incomplete Storage cleanup.
- **5.4 — Not complete.** No current comprehensive E2E reaches checklist/scoring/draft/review/recommendation/finalize/decision; server-side finalize/decision gates and `invested` analytics are inconsistent with the OpenSpec contract.
- **5.5 — Not complete.** Only concurrent promotion is covered end to end. The most important incomplete/repeat paths either lack browser evidence or currently succeed when they should block.

## Files used as authoritative evidence

- OpenSpec: `openspec/changes/add-comprehensive-site-e2e/{proposal.md,design.md,tasks.md}` and `specs/comprehensive-site-e2e/spec.md`.
- Runner/fixture: `playwright.config.ts`, `scripts/e2e/run-comprehensive.mjs`, `scripts/e2e/capabilities.mjs`, `scripts/investment-e2e-fixture.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/investment-flow.spec.ts`, `tests/e2e/experts.spec.ts`.
- Deal Research: `app/api/deals/[id]/research/route.ts`, `lib/deals/research-{queue,worker,persistence,search-tool}.ts`, `lib/deals/research.ts`, `lib/background-jobs/*`, `app/api/cron/background-jobs/route.ts`.
- Promotion: `app/api/deals/[id]/promote-to-diligence/route.ts`, `supabase/migrations/20260727010000_atomic_deal_promotion.sql`.
- Diligence: `app/api/diligence/[id]/agent/*`, `app/api/cron/memo-agent-worker/route.ts`, `lib/memo-agent/jobs/*`, `lib/memo-agent/stages/*`, `components/diligence/stage-header.tsx`, `app/(app)/diligence/[id]/deal-detail.tsx`.
- Expert: `components/diligence/expert-validation-panel.tsx`, `app/api/diligence/[id]/expert-validations/*`, `app/api/public/expert-response/*`, `lib/expert-validation/*`, `lib/diligence/enqueue-ingest.ts`, `supabase/migrations/20260722010000_expert_validation.sql`.
- Memo/final decision: `app/(app)/diligence/[id]/drafts/[draftId]/memo-editor.tsx`, `app/api/diligence/[id]/drafts/[draftId]/finalize/route.ts`, `lib/diligence/memo-finalization.ts`, `app/api/diligence/[id]/route.ts`, `app/api/diligence/analytics/route.ts`, `lib/diligence/progress.ts`.
