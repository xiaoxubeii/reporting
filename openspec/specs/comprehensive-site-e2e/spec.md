# comprehensive-site-e2e Specification

## Purpose
TBD - created by archiving change add-comprehensive-site-e2e. Update Purpose after archive.
## Requirements
### Requirement: Isolated and reproducible browser acceptance environment
The system SHALL provide one documented command that executes the comprehensive suite against the real Web entrypoint with unique disposable users, Funds, tenant hosts, and content. The harness MUST refuse non-local destructive fixture operations, MUST keep secrets out of artifacts, and MUST clean only resources owned by its run marker.

#### Scenario: Successful isolated setup and cleanup
- **WHEN** an operator runs the comprehensive E2E command against the supported local dependencies
- **THEN** the harness provisions uniquely tagged state, records capability checks, runs through the external browser entrypoint, and removes its owned resources without changing pre-existing data

#### Scenario: Unsafe fixture target
- **WHEN** fixture creation or cleanup resolves to a non-local Supabase target, untrusted state path, missing run marker, or unowned resource
- **THEN** the harness fails closed before destructive mutation and records the safety error

### Requirement: Multi-tenant registration and isolation journey
The suite SHALL drive user registration or supported local account activation, first-Fund creation, canonical tenant continuation, authentication, branding, and the authenticated tenant interface through visible controls. It MUST prove that a second Fund and browser context cannot read, mutate, or reuse the first Fund's session, URLs, records, tokens, or branding.

#### Scenario: New user creates and enters a Fund workspace
- **WHEN** a unique user completes registration/onboarding and creates a valid Fund identity
- **THEN** the browser reaches that Fund's canonical tenant interface with the correct Host, Fund branding, membership, navigation, and authorized settings

#### Scenario: Cross-Fund access is denied
- **WHEN** an authenticated context, copied URL, token, or session from Fund A is presented to Fund B
- **THEN** the product fails closed without exposing Fund A data or applying a mutation in either Fund

### Requirement: Adapter-complete Search journey
The suite SHALL exercise Search from the user interface for every enabled code-reviewed source and adapter, including personal Feed search, SearXNG, and all direct professional adapters present in the runtime registry. It MUST verify source provenance, safe origin-correct actions, category/Fund authorization, result normalization, and explicit partial/degraded states.

#### Scenario: Every enabled Search adapter is exercised
- **WHEN** an authorized user selects each available source/category and submits representative and no-result queries
- **THEN** each enabled adapter records a terminal outcome with correctly attributed safe results or an explicit designed unavailable/partial state, and no adapter is silently omitted

#### Scenario: Search rejects unsafe or unauthorized output
- **WHEN** a source returns an unsafe URL, malformed item, inaccessible category, or data outside the user's Fund scope
- **THEN** the product excludes or rejects it and preserves the remaining safe partial results without widening authorization

### Requirement: Complete Feeds subscription and intelligence journey
The suite SHALL drive source discovery, follow, category selection and creation, Following management, Today/reader state, Explore, Trending, Deal Signals, and the confirmed Feed-to-Deal handoff through the UI. It MUST cover personal Miniflux ownership, curated collector read-only behavior, category isolation, duplicate/idempotent actions, and recoverable provider failures.

#### Scenario: User follows and manages a source
- **WHEN** an authorized user discovers a trusted source, follows it into a new or existing personal category, reads and saves an entry, and later updates or unfollows it
- **THEN** the UI and backing service show exactly one personal subscription with consistent category/read/save state and no shared collector mutation

#### Scenario: Explore intelligence creates a confirmed Deal signal
- **WHEN** refreshed Explore content produces Trending and an evidence-gated Deal Signal and the user confirms the handoff
- **THEN** the UI shows explainable provenance and creates exactly one Fund-scoped Deal through the supported manual confirmation path

### Requirement: Complete pre-investment decision journey
The suite SHALL drive one uniquely tagged public Pitch through Idea/Inbound screening, Deal creation, external Research, expert validation, Diligence ingestion/research/checklist/scoring, Memo drafting/review/finalization, and final investment decision state using the real UI and background-job paths. Every stage MUST preserve Fund scope, provenance, idempotency, missing-evidence honesty, and links to its predecessor.

#### Scenario: Pitch reaches a finalized evidence-grounded Memo
- **WHEN** a public Pitch is submitted and an authorized investment user advances it through the supported research, expert, diligence, scoring, and Memo controls
- **THEN** exactly one linked record exists at each required stage, research and expert evidence remain attributable, unresolved checklist gaps remain explicit, and a partner-authored recommendation is required before finalization

#### Scenario: Repeated or incomplete investment actions fail safely
- **WHEN** the user repeats promotion/materialization/finalization or attempts a decision without required evidence or recommendation
- **THEN** the product remains idempotent or returns a clear blocking state without fabricating evidence, duplicating downstream records, or losing provenance

### Requirement: Inbound, outbound, and notification journey
The suite SHALL exercise supported outbound mail, reply routing, inbound Deal/Pitch mail, expert invitation delivery or its documented unavailable-provider path, and visible in-app notifications. Provider credentials, From/Reply-To identities, Fund routing, signatures, idempotency, and user-visible failure recovery MUST be verified at their real boundaries.

#### Scenario: Configured mail round trip
- **WHEN** a configured test Fund sends a supported message and a valid signed inbound reply/event is received
- **THEN** the provider request, durable thread/message state, Fund-derived identities, inbound routing, and recipient notification are consistent and exactly-once

#### Scenario: Invalid or unavailable mail path
- **WHEN** a provider is intentionally unconfigured or an inbound event has an invalid signature, wrong Fund route, duplicate provider ID, or unsafe attachment
- **THEN** the system exposes the documented recoverable or fail-closed state, leaks no credentials or cross-Fund data, and creates no unauthorized message or notification

### Requirement: Primary product surface sweep
The suite SHALL maintain an explicit inventory of authenticated primary navigation and critical public/LP surfaces not already covered by the preceding journeys. For each enabled and authorized surface it MUST verify navigation, meaningful loaded or empty state, localization/accessibility basics, and absence of unexpected page, console, and first-party network errors at desktop and representative mobile viewport sizes.

#### Scenario: Enabled primary routes remain usable
- **WHEN** the test user traverses every enabled primary navigation item and selected critical detail/action pages
- **THEN** each route reaches an authorized meaningful state, core controls are keyboard reachable, responsive layout remains usable, and unexpected runtime failures are reported with route-level evidence

### Requirement: Failure repair and evidence contract
The comprehensive run SHALL classify every failure as test fragility, dependency/configuration failure, or product defect. Every reproducible product defect MUST receive a focused regression test and architecture-correct repair before the scenario is considered passing. The run MUST emit machine-readable results and retain trace, screenshot, video, console, page-error, and failed-request evidence for failures.

#### Scenario: Product defect discovered during E2E
- **WHEN** a real browser journey exposes a reproducible application defect
- **THEN** the defect is narrowed to its owning contract, repaired with focused regression coverage, and the exact browser journey is rerun successfully before closure

#### Scenario: Comprehensive report is generated
- **WHEN** the suite finishes successfully or unsuccessfully
- **THEN** an operator can identify every required scenario's status, dependency capability, created-resource cleanup state, failure classification, and artifact paths from the report
