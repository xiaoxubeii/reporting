## 1. Contracts and configuration

- [x] 1.1 Add failing tests for collector token loading, safe failures, and secret-file precedence
- [x] 1.2 Add failing tests for strict namespaced category, source, and entry references
- [x] 1.3 Implement collector configuration and namespaced reference helpers
- [x] 1.4 Document the server-only collector configuration and remove obsolete AEAD language from the architecture document

## 2. Collector service

- [x] 2.1 Add failing tests for non-admin identity verification, read-only category/list/detail behavior, and collector ownership checks
- [x] 2.2 Add Miniflux category filtering support with focused client tests
- [x] 2.3 Implement the read-only Explore service and dedicated response DTOs without shared read/saved fields
- [x] 2.4 Add failing tests for trusted source resolution, personal-user isolation, and idempotent Follow
- [x] 2.5 Implement Follow through the existing personal FeedService without copying editorial categories

## 3. BFF routes and access contracts

- [x] 3.1 Add failing API and access-contract tests for categories, entries, detail, and rate-limited Follow
- [x] 3.2 Implement authenticated Explore BFF routes with bounded input parsing and existing safe envelopes
- [x] 3.3 Verify that no Explore read/save or collector subscription mutation route exists

## 4. Today user experience

- [x] 4.1 Add failing UI contract tests for URL-backed Me/Explore separation and read-only Explore controls
- [x] 4.2 Implement the Explore API client, category/search/pagination view, and personal Follow states
- [x] 4.3 Add a URL-backed Me/Explore switch to Today while preserving the current Me behavior
- [x] 4.4 Implement read-only Explore article detail without automatic mark-read or save controls
- [x] 4.5 Verify desktop and mobile empty, loading, success, error, and retry states match the existing page layout

## 5. Verification and review

- [x] 5.1 Run focused unit, service, route, access, and UI contract tests
- [x] 5.2 Run TypeScript, lint, OpenSpec strict validation, full tests, production build, and HarnessKit verification; separate pre-existing failures
- [x] 5.3 Run code and security reviews and resolve all in-scope critical/high findings
- [x] 5.4 Verify the real Miniflux and Reporting browser flow on desktop and mobile, including category filtering, article detail, idempotent Follow, per-user isolation, and independent collector failure
- [x] 5.5 Record final HarnessKit and OpenSpec evidence with no Reporting feed persistence or V2 scope added
