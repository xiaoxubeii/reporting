## 1. Planning and Contracts

- [x] 1.1 Register the curated source catalog in HarnessKit feature planning and execution state
- [x] 1.2 Add failing service, route, access, UI behavior, and localization contract tests for the new experience

## 2. Curated Source Directory

- [x] 2.1 Add sanitized curated source DTOs, deterministic featured sources, filtering, and collector ownership validation to ExploreFeedService
- [x] 2.2 Add the authenticated, rate-limited read-only GET `/api/feeds/explore/sources` route and access registry entry
- [x] 2.3 Verify the collector remains read-only and curated responses never expose feed URLs or personal state

## 3. Follow Sources Experience

- [x] 3.1 Add client API types and a focused curated source catalog component with independent loading and error state
- [x] 3.2 Add URL-backed Explore sources and Following views while preserving personal connection, category, health, and unfollow workflows
- [x] 3.3 Add unified keyword and Website/RSS URL search, category cards, responsive category Sheet, and trusted-reference Follow state
- [x] 3.4 Add complete English and Simplified Chinese copy for the redesigned surface

## 4. Verification and Handoff

- [x] 4.1 Pass focused tests, changed-scope lint/type checks, strict OpenSpec validation, and HarnessKit fast; run the targeted gate and record unrelated repository blockers
- [x] 4.2 Verify the real authenticated desktop and mobile browser flows, including refresh persistence and personal-connection failure independence
- [x] 4.3 Complete code, accessibility, and security review; resolve in-scope findings and record final evidence
