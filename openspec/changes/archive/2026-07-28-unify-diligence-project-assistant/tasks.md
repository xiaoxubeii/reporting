## 1. Project Scope and UI

- [x] 1.1 Bind the global Assistant to diligence detail, memo draft, and legacy Q&A pages
- [x] 1.2 Remove the embedded detail-page Q&A and expose legacy history as a read-only thread
- [x] 1.3 Disable sending from legacy history and provide an explicit new project conversation action
- [x] 1.4 Render validated citations, block remote Markdown images, and restrict links

## 2. Conversation and Permission Boundaries

- [x] 2.1 Persist exact project-scoped private conversations and restore only server-owned history
- [x] 2.2 Enforce current Fund, owner, scope, and live domain access on conversation APIs
- [x] 2.3 Gate Affinity with both relationships interactions and notes access, exact Fund credentials, and project-organization-only read tools
- [x] 2.4 Report conversation persistence failure and prevent orphan evidence promotion
- [x] 2.5 Append existing conversations through a bounded scope-safe compare-and-swap RPC and reject untrusted legacy project threads
- [x] 2.6 Require live diligence and relationships permissions for Affinity linking, unlinking, and data-room imports
- [x] 2.7 Require live diligence write access and exact Fund/deal/session binding for every Q&A lifecycle route

## 3. Evidence Integrity

- [x] 3.1 Reuse evidence-grounded diligence answering and validate document citations
- [x] 3.2 Archive eligible answers with assistant-derived provenance and excluded/unverified defaults
- [x] 3.3 Prevent unverified derived answers from re-entering Q&A context, memo, or scoring
- [x] 3.4 Move append, session replace, include/exclude, and delete writes to row-locking RPCs
- [x] 3.5 Stream-limit all Q&A request bodies and atomically append both AI and Partner session messages
- [x] 3.6 Finish Q&A under the same session row lock so accepted answers and stage transitions cannot race
- [x] 3.7 Reject stale AI batch appends with an expected-message-count conflict instead of duplicating questions
- [x] 3.8 Start or reuse the one active project QA session through a transaction-scoped database lock
- [x] 3.9 Bind every active QA session to its exact memo draft so a new draft cannot inherit stale questions or answers

## 4. Database Security

- [x] 4.1 Make Assistant history, legacy chats, memo drafts, and QA session messages unavailable through the browser Data API
- [x] 4.2 Add owner-only Assistant-history RLS as defense in depth
- [x] 4.3 Harden SECURITY DEFINER functions with qualified objects, validation, bounds, and service-role-only execution
- [x] 4.4 Remove obsolete broad RLS policies and the unused empty-conversation creation endpoint

## 5. Verification

- [x] 5.1 Pass focused route, UI, permission, provenance, and concurrency tests
- [x] 5.2 Pass OpenSpec strict validation, TypeScript/build, lint, and full test suite or document unrelated blockers
- [x] 5.3 Verify the real tenant browser flow on the running application
- [x] 5.4 Apply migrations to a local Supabase database and verify authenticated Data API denial if the local database is available

Verification notes (2026-07-28):

- OpenSpec strict validation passes. The focused Analyst/diligence suite passes 111/111, including exact-Fund Affinity, project-organization isolation, cited-only promotion, concurrent conversation append, bounded Q&A input, atomic AI/Partner session append, authoritative-draft isolation, and Q&A lifecycle authorization coverage. A full typecheck excluding the separately failing platform-logo test passes.
- Targeted lint passes for the new Assistant routes/components, Q&A lifecycle routes, bounded input, and persistence modules. Older diligence modules touched by the integration still expose their existing `no-explicit-any` lint debt. The production build compiles successfully before reaching repository-wide ESLint failures; the standalone TypeScript check is blocked by the existing `platform-landing-logo-assets` ES target error. The full suite passes 2,198 tests and has five unrelated failures: four in the concurrently changing platform landing/logo surface and one stale source-text assertion in the independent expert-validation/research work.
- Real tenant browser verification passes on the diligence project overview and Partner Q&A route: the single global Assistant binds to project `test`; the Deals page restores generic portfolio scope; no second project assistant is rendered. The final security-only pass did not change Assistant UI composition.
- Applied the change migrations to the healthy local `reporting-fund-host-e2e` Supabase instance. Authenticated PostgREST reads return `403` for `analyst_conversations`, `diligence_qa_chats`, and `diligence_memo_drafts`, while `service_role` reads return `200`; SQL privileges also confirm authenticated users have no direct access to `diligence_agent_sessions`. SQL inspection confirms no remaining legacy-chat, memo-draft, or QA-session broad RLS policy, owner-only Analyst policies, service-role-only RPC execution, `SECURITY DEFINER`, and empty `search_path`. Direct SQL verification returns `persisted` for the first conversation append, `conflict` for a stale append, and preserves an exact 2-message count. The atomic QA lifecycle transaction reuses one open session, rejects a stale AI batch, merges 200 session answers with external evidence, marks the session `qa_complete`, and rejects both late answers and non-QA session writes. A separate version-switch transaction confirms that start, AI append, Partner append, and finish all reject the previously authoritative draft without changing the project stage, while the newest live draft accepts the complete lifecycle and alone advances the project. A clean `supabase start` for project id `reporting` remains independently blocked by the older `20260312100002_compliance_seed.sql` migration, before this change's migrations.
