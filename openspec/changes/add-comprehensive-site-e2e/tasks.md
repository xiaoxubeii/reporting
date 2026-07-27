## 1. Planning and Baseline

- [x] 1.1 Define the comprehensive browser acceptance matrix, architecture path, isolation boundary, and failure-repair protocol
- [ ] 1.2 Create the dedicated `comprehensive-site-e2e` worktree and record the exact baseline commit and existing verification status
- [ ] 1.3 Inventory every primary route, Search adapter, Feeds capability, investment stage, mail path, notification surface, and required external dependency from current code
- [ ] 1.4 Validate this OpenSpec strictly and add the feature to HarnessKit plan/state/progress tracking

## 2. Durable Runner and Safe Fixtures

- [ ] 2.1 Add Playwright, project configuration, reporters, artifact retention, and documented package commands for full and targeted E2E runs
- [ ] 2.2 Implement typed fixtures for unique users, two isolated Funds, tenant hosts, roles, settings, content markers, and authenticated browser contexts
- [ ] 2.3 Implement localhost-only fixture state, ownership validation, idempotent cleanup, secret redaction, and cleanup regression tests
- [ ] 2.4 Implement dependency capability checks for Supabase, Web/Cron, Miniflux, SearXNG, AI, mail, and browser runtime
- [ ] 2.5 Implement shared browser observers that fail on unexpected page errors, console errors, and first-party failed requests and attach trace/screenshot/video/report evidence

## 3. Multi-Tenant and Search Journeys

- [ ] 3.1 Drive registration or supported local activation, Fund creation, canonical tenant continuation, branding, login/logout, and authenticated navigation
- [ ] 3.2 Prove second-Fund Host, session, URL, token, branding, read, and mutation isolation using independent browser contexts
- [ ] 3.3 Derive the enabled Search source/adapter inventory from the application contract and execute representative, no-result, and partial-failure queries for every adapter
- [ ] 3.4 Verify Search provenance, category/Fund authorization, safe URLs/actions, result normalization, unsafe-result rejection, and degraded states
- [ ] 3.5 Reproduce, repair, cover, and rerun every defect found in tenant or Search journeys

## 4. Feeds Subscription and Intelligence Journeys

- [ ] 4.1 Drive curated source discovery, follow into existing and newly created personal categories, duplicate follow, reader read/save state, and unfollow recovery
- [ ] 4.2 Verify Following grouping/management and personal Miniflux isolation from the read-only curated collector and from the second Fund/user
- [ ] 4.3 Drive Explore Latest, Trending refresh/explanations, Deal Signals, and confirmed Feed-to-Deal handoff through real controls and background jobs
- [ ] 4.4 Exercise unavailable Miniflux/SearXNG/provider responses and verify explicit recoverable or partial UI states
- [ ] 4.5 Reproduce, repair, cover, and rerun every defect found in Feeds journeys

## 5. Investment Decision Journey

- [ ] 5.1 Submit one uniquely tagged public Pitch and verify exactly one Fund-scoped Inbound/Idea extraction and Deal conversion
- [ ] 5.2 Run Deal Research through the real queued/Cron path, verify terminal status, grounded sources, history, rejection/recovery, and exactly-once Diligence promotion
- [ ] 5.3 Run Diligence ingestion and Research, create/invite an expert, submit the public answer, and verify exactly-once immutable `industry_expert` materialization and re-ingestion
- [ ] 5.4 Run checklist, scoring, Memo drafting/self-review, partner recommendation, finalization, and final decision while preserving unresolved evidence gaps and provenance
- [ ] 5.5 Exercise repeated/incomplete promotion, expert submission, materialization, and finalization failure paths
- [ ] 5.6 Reproduce, repair, cover, and rerun every defect found in the investment journey

## 6. Mail, Notifications, and Remaining Product Sweep

- [ ] 6.1 Exercise configured outbound mail and valid signed inbound reply/Pitch paths, durable thread state, Fund-derived identities, idempotency, and visible notifications
- [ ] 6.2 Exercise intentionally unconfigured provider, invalid signature, wrong-Fund route, duplicate provider event, and unsafe attachment failure paths
- [ ] 6.3 Exercise expert invitation delivery when configured and the documented copy-link/fail-closed path when not configured
- [ ] 6.4 Traverse every remaining enabled primary GP navigation and critical detail/action page at desktop and representative mobile viewports
- [ ] 6.5 Traverse critical public, authentication, and LP Portal surfaces with correct and denied identities and verify localization/accessibility basics
- [ ] 6.6 Reproduce, repair, cover, and rerun every defect found in mail, notification, or route-sweep journeys

## 7. Verification and Handoff

- [ ] 7.1 Run focused regression tests, fixture safety tests, TypeScript, changed-scope ESLint, diff/secret/bootstrap scans, and strict OpenSpec validation
- [ ] 7.2 Run the complete Playwright matrix repeatedly enough to expose flakiness and retain the final machine-readable/HTML report plus required failure artifacts
- [ ] 7.3 Run full Vitest, production build, HarnessKit fast/targeted/full verification, and document any inherited baseline separately
- [ ] 7.4 Complete correctness, security, and browser/UX reviews and resolve every in-scope Blocker/High/Important finding
- [ ] 7.5 Audit every specification requirement against authoritative current-state evidence, update HarnessKit state/progress, and prepare the clean feature branch for handoff
