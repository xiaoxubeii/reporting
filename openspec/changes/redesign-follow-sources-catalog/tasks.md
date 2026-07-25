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
- [x] 4.4 Align category typography with the supplied reference and remove Explore source counts and the search helper copy
- [x] 4.5 Match the category label size to the featured source content size
- [x] 4.6 Use a compact four-column category grid at desktop widths
- [x] 4.7 Reduce category card height and vertical spacing while preserving source readability

## 5. Personal Category Grouping Follow-up

- [x] 5.1 Add failing service, route, and UI contract tests for category-aware trusted Follow and grouped Following
- [x] 5.2 Reuse the accessible category picker for curated sources and accept only a bounded personal category choice beside the trusted source reference
- [x] 5.3 Replace Following topic cards and topic Sheet with non-empty personal category groups and Uncategorized last
- [x] 5.4 Pass focused tests, changed-scope lint/type checks, strict OpenSpec/HarnessKit verification, reviews, and real desktop/mobile browser flows
