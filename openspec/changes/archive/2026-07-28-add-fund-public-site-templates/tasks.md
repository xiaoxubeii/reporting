## 1. Contracts and security tests

- [x] 1.1 Add failing schema tests for supported templates, bilingual fallback, bounded structured input, unknown fields, and unsafe URLs
- [x] 1.2 Add failing migration/RLS tests for direct-read denial, published-only anonymous resolution, exact Fund isolation, and atomic publish/unpublish snapshots
- [x] 1.3 Add failing API authorization tests for authentication, administrator role, Host-to-Fund matching, stale revisions, and rejection of caller-supplied Fund scope
- [x] 1.4 Add failing rendering/routing tests for platform versus tenant root, unpublished private state, shared template input, and lossless template changes

## 2. Persistence and domain model

- [x] 2.1 Add the isolated `fund_public_sites` migration with draft/published fields, revisions, constraints, RLS, timestamps, and least-privilege grants
- [x] 2.2 Add exact-slug anonymous resolution and atomic administrator publish/unpublish database functions with fixed search paths and allowlisted results
- [x] 2.3 Add generated database types and migration-level security regression coverage
- [x] 2.4 Implement the strict versioned TypeScript/JSON validation, normalization, locale fallback, defaults, and safe-link helpers

## 3. Fund-scoped administration API

- [x] 3.1 Implement a shared authenticated Host-Fund administrator guard that never accepts client-selected Fund scope
- [x] 3.2 Implement draft read/create and optimistic save endpoints with structured validation and conflict responses
- [x] 3.3 Implement atomic publish and unpublish endpoints with explicit version/state responses
- [x] 3.4 Implement the private draft preview data boundary with no-store/noindex behavior

## 4. Built-in templates and public routing

- [x] 4.1 Implement shared accessible public-site primitives and the `focus`, `institutional`, and `minimal` responsive templates
- [x] 4.2 Implement published tenant-site resolution and a uniform branded private/sign-in state for unknown or unpublished sites
- [x] 4.3 Branch `/` by trusted host so the platform keeps its current marketing homepage while a tenant renders only Fund content
- [x] 4.4 Bypass platform product chrome, analytics, and authenticated-user redirect only on tenant `/`, preserving all other paths
- [x] 4.5 Generate locale-aware public metadata and ensure preview and unpublished pages are not indexed

## 5. Settings authoring workflow

- [x] 5.1 Add an administrator-only `Settings → Public Site` entry and route
- [x] 5.2 Add the three template cards and structured bilingual Fund, strategy, CTA, team, portfolio, visibility, and SEO fields
- [x] 5.3 Add save status, stale-edit recovery, desktop/mobile production-renderer preview, and clear unpublished-change state
- [x] 5.4 Add explicit publish confirmation, unpublish control, live-version feedback, and localized English/Chinese interface copy

## 6. Verification and review

- [x] 6.1 Pass focused schema, migration, authorization, rendering, and settings tests plus TypeScript and diff checks
- [x] 6.2 Run correctness and security reviews and resolve all high/critical findings
- [x] 6.3 Pass the production build and applicable HarnessKit verification tiers, recording any unrelated repository blockers precisely
- [x] 6.4 Verify the real browser flow on platform, two tenant hosts, authenticated Settings preview, publish, live locale/mobile rendering, and unpublish with console/network evidence
- [x] 6.5 Update HarnessKit feature inventory/progress and mark OpenSpec tasks complete with evidence
