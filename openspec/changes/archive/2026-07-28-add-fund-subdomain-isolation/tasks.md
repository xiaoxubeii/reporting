## 1. Planning and Contracts

- [x] 1.1 Register the feature in HarnessKit with goal, acceptance, allowed scope, security boundary, merge order, and full verification plan
- [x] 1.2 Add contract-first tests for supported-host parsing, reserved labels, suffix attacks, trailing dots, ports, and legacy mode
- [x] 1.3 Add executable migration contract tests for constrained unique Fund slugs and minimal host/LP resolution functions
- [x] 1.4 Add a tested Host-class × route-authority registry covering tenant, platform, reserved/internal, invalid, and legacy modes

## 2. Fund Slug and Host Resolution

- [x] 2.1 Add and backfill immutable DNS-safe `funds.slug` with database validation, uniqueness, reserved-label rejection, and generated types
- [x] 2.2 Add least-privilege database functions for exact public Fund descriptor resolution and single-Fund LP context resolution
- [x] 2.3 Audit existing GP/direct-LP/delegated-LP identities and enforce one distinct Fund across all future provisioning writes
- [x] 2.4 Implement the pure deployment-mode/host parser and canonical Fund origin builder
- [x] 2.5 Implement a cached server-only tenant descriptor resolver keyed by trusted slug
- [x] 2.6 Generate valid collision-safe slugs for newly created Funds without changing Fund rename behavior

## 3. Central Request Boundary

- [x] 3.1 Strip forged tenant headers and inject only the hostname-derived trusted tenant slug in middleware
- [x] 3.2 Resolve configured tenant hosts before protected routes and return a uniform not-found response for invalid or unknown tenants
- [x] 3.3 Enforce the Host-class route registry before current expert/background/webhook/auth bypasses
- [x] 3.4 Require GP session/access-context Fund equality for tenant-hosted pages and APIs before existing domain grants
- [x] 3.5 Require LP account Fund equality for tenant-hosted Portal pages and session APIs while preserving welcome/active/dual-user behavior
- [x] 3.6 Keep legacy self-host behavior unchanged when tenant hosting is disabled and keep host-only Supabase cookies

## 4. Branding Without Path Changes

- [x] 4.1 Provide request-scoped safe tenant branding to public and authentication UI without exposing private Fund settings
- [x] 4.2 Render Fund name, logo, and safe theme on the existing `/` Landing path
- [x] 4.3 Render Fund name, logo, and safe theme on existing `/auth` paths and enforce post-login Host/Fund mismatch handling
- [x] 4.4 Scope tenant signup/join/onboarding to the Host Fund, restrict Fund creation to platform/legacy mode, and clear wrong-Fund login sessions
- [x] 4.5 Verify existing Dashboard and LP Portal branding can render only under their matching Fund hostname
- [x] 4.6 Ensure tenant branding and metadata caches are keyed by slug/Fund and cannot bleed across hosts

## 5. Non-Session Authorities and Canonical Links

- [x] 5.1 Bind public deal-submission tokens to the tenant Host Fund while preserving the existing submission path and feature checks
- [x] 5.2 Bind public expert-response tokens to the tenant Host Fund while preserving fragment-token isolation and no-store behavior
- [x] 5.3 Bind API key and OAuth/MCP credentials/resources to the tenant Host Fund without weakening existing scopes or audiences
- [x] 5.4 Preserve persisted-job/token Fund authority for background workers and provider-authenticated Fund authority for inbound webhooks on platform/internal hosts
- [x] 5.5 Audit service-role resource routes and Storage signed upload/download paths for explicit authorized `fund_id` fences
- [x] 5.6 Generate Fund-facing email, invitation, submission, LP, and callback links from persisted Fund slug plus configured root domain

## 6. Verification and Handoff

- [x] 6.1 Run host parser, migration, middleware, auth, public-token, OAuth/MCP, service-role, Storage, and canonical-link targeted tests
- [x] 6.2 Run cross-Fund integration tests proving Fund A identities and resource IDs cannot read or mutate Fund B on either hostname
- [x] 6.3 Run real browser flows for tenant Landing, login, Dashboard, wrong-Fund login denial, LP welcome/overview, and sibling-host cookie isolation
- [x] 6.4 Run TypeScript, changed-scope lint, production build, OpenSpec strict validation, HarnessKit fast/targeted/full, and `git diff --check`
- [x] 6.5 Complete correctness, security, and browser/UX reviews; fix all critical/high findings and record remaining risks
- [x] 6.6 Update OpenSpec tasks and HarnessKit progress/evidence with requirement-by-requirement completion proof
