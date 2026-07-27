## Why

Reporting has broad unit and focused browser coverage, but it lacks one repeatable, isolated, interface-driven acceptance suite that proves the major FundWorkspace journeys work together. Cross-feature regressions can therefore survive local tests, especially where tenant Host routing, external adapters, background jobs, email, and the investment pipeline meet.

## What Changes

- Add an isolated comprehensive browser acceptance harness that provisions disposable users, Funds, permissions, content, adapter configuration, and mail state without reusing production data.
- Exercise registration and Fund creation, tenant-host routing and branding, federated Search, Feeds subscription/category/Explore/Trending/Deal Signals, Pitch-to-Memo investment decisions, inbound/outbound mail, notifications, and a risk-based sweep of the remaining primary navigation.
- Capture deterministic assertions, console/page/network failures, screenshots, and traces for every workflow while treating configured external services as real dependencies rather than bypassing the product boundary.
- Repair every reproducible in-scope product defect at its owning contract and add focused regression coverage before rerunning the failed browser journey.
- Provide one documented command and machine-readable report so the suite can be rerun locally and in a suitable CI environment.

## Capabilities

### New Capabilities

- `comprehensive-site-e2e`: Isolated, interface-driven acceptance coverage and repair workflow for Fund tenancy, Search, Feeds, investment decisions, mail/notifications, and the remaining primary product surfaces.

### Modified Capabilities

- None initially. If execution discovers a product contract defect, the relevant requirement delta will be added before implementing that behavioral fix.

## Impact

- New browser test configuration, fixtures, page/workflow helpers, runtime orchestration, evidence, and operator documentation.
- Existing product modules may change only when a browser failure proves an in-scope defect; each such change requires a focused regression test and security/permission review appropriate to the boundary.
- Local Supabase, Web/Cron, Miniflux, SearXNG, AI-provider, email-provider, and browser runtime integration are in scope. Secrets remain environment-provided and disposable test data must be cleaned up.
