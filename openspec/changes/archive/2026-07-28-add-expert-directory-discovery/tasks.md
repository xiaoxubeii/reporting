## 1. Data and shared contracts

- [x] 1.1 Add migration coverage for expert trust/provenance fields, fund-scoped candidate lifecycle, indexes, grants, and constraints.
- [x] 1.2 Add and test the service-role-only idempotent candidate-confirmation database function.
- [x] 1.3 Regenerate database types and extend expert/candidate DTOs and strict input validation.

## 2. Discovery domain

- [x] 2.1 Add contract tests and an immutable `ExpertDiscoveryAdapter` interface with bounded candidate/evidence/source-status output.
- [x] 2.2 Implement and fixture-test PubMed author discovery using Reporting Search's bounded API transport.
- [x] 2.3 Implement and fixture-test ClinicalTrials.gov investigator discovery using Reporting Search's bounded API transport.
- [x] 2.4 Implement fund-scoped discovery orchestration, conservative identity deduplication, persistence, partial-source handling, and candidate list/reject/confirm services.
- [x] 2.5 Verify promotion creates embeddings best-effort and never makes a pending/rejected candidate matchable.

## 3. Authorized APIs

- [x] 3.1 Extend Expert list/create/update responses with trust/provenance and enforce fund-admin writes without weakening the trusted global-admin boundary.
- [x] 3.2 Add same-origin, rate-limited discovery and candidate list endpoints with strict source/query bounds.
- [x] 3.3 Add fund-isolated confirm and reject endpoints with idempotency and route/access contract tests.

## 4. Expert Directory UI

- [x] 4.1 Add Expert Directory navigation/access metadata and English/Chinese messages.
- [x] 4.2 Implement the authenticated responsive `/experts` server page and client directory with Platform Certified and Fund Experts views, search, badges, empty/error states, and manual creation/editing.
- [x] 4.3 Implement the Discovery view with source selection, query, partial statuses, candidate evidence, explicit email confirmation, rejection, and immediate promotion feedback.

## 5. Diligence integration

- [x] 5.1 Show verification/provenance badges and an Expert Directory entry point in the existing Diligence expert-validation panel.
- [x] 5.2 Add focused tests proving current-fund and platform experts remain eligible while candidates and other-fund experts remain excluded.

## 6. Verification and handoff

- [x] 6.1 Run strict OpenSpec, migration/type, targeted unit/API/component, TypeScript, changed-file lint, security, and HarnessKit verification; resolve findings.
- [x] 6.2 Run the real authenticated desktop/mobile browser flow for manual creation, discovery, confirmation, directory visibility, and Diligence selection, capturing evidence.
- [x] 6.3 Update Feature Plan/OpenSpec progress with final evidence and confirm no bootstrap markers or unrelated changes remain.

Verification evidence is recorded under `.harnesskit/evidence/add-expert-directory-discovery/`. Repository-wide ESLint remains blocked by pre-existing errors outside this change; changed-file ESLint, TypeScript, full Vitest, database contracts, strict OpenSpec, and `next build --no-lint` pass.
