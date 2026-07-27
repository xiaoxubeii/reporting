# Multi-tenant Resend mail verification

Date: 2026-07-26

## Outcome

The implementation is complete for the local application boundary. Platform mail and Fund mail remain credential-isolated; Fund sender identities and reply routes are server-derived; signed Resend inbound events are claimed idempotently; pitch mail enters the existing Fund-scoped Deal screening path; and expert replies remain plain-text thread mail rather than expert submissions.

The external provider exercise is **blocked**, not reported as passed: this checkout has no operator-owned Resend sending/receiving keys, verified `fundworkspace.com` Fund subdomain DNS, or live webhook secret. No real external message was sent.

## Automated evidence

- `npm test`: 254 test files and 1,788 tests passed; 4 files and 8 environment-gated tests skipped.
- `npx tsc --noEmit`: passed.
- Focused email/provider ESLint produced no added-line diagnostics. The combined
  changed-file command still reports five pre-existing diagnostics in the
  legacy Settings route.
- `npx openspec validate add-multi-tenant-resend-mail --strict`: passed.
- `git diff --check`: passed.
- Secret-pattern scan and `BOOTSTRAP_ONLY` / `NOT_ARCHITECTURE_COMPLIANT` / `TEMP_ADAPTER` scan: passed.
- `npx next build --no-lint`: passed from the current source tree, including type validation, page-data generation, 268 static pages, and route tracing.
- The revised service-role RPCs were applied to the running local Supabase and
  their exact signatures/security-definer status were verified. The legacy-key
  promotion RPC uses provider, empty-authoritative-key, and expected-legacy-
  ciphertext CAS conditions; the explicit Settings RPC atomically updates the
  Resend key, provider selection, and legacy cleanup.
- Local Supabase reset and the opt-in two-Fund isolation/event-fencing integration suite passed earlier in this change.

HarnessKit fast/full currently stop on the unrelated machine-state value `feed-discovery: complete`, which is not a status accepted by the current clean-state checker. HarnessKit targeted reaches the existing repository-wide ESLint debt outside this email change. Neither blocker produces an added-line diagnostic in this change.

## Browser evidence

- Authenticated English and Chinese Settings desktop plus Chinese 390 px mobile layouts passed. Screenshots: `settings-fund-email-en-desktop.png`, `settings-fund-email-zh-desktop.png`, and `settings-fund-email-zh-mobile.png`.
- The invitation provider-failure/copy-link fallback passed. Screenshot: `expert-invitation-copy-link-fallback.png`.
- A final isolated-source authenticated pass rendered the Fund mailbox and Fund email connection controls. `GET /api/settings/fund-email` returned 200 with `configured: false`, `isAdmin: true`, and `baseDomain: fundworkspace.com`; it exposed no sending key, receiving key, webhook secret, API key, or route token.
- The final provider-integration pass at `http://localhost:5010/settings`
  showed Resend alongside Postmark and Mailgun in the existing inbound selector,
  rendered only the Resend Fund subdomain and Full Access key controls when
  selected, and restored the persisted Mailgun selection after reload. The
  outbound selectors retained Resend, Postmark, Mailgun, and Gmail.
- The real Diligence Expert validation surface rendered its persisted request. Because this Fund has no configured Resend connection, the persisted request had no email thread and the authenticated thread endpoint returned a controlled 404 without private data.
- Browser console had no email-feature JavaScript errors. Local Vercel Analytics CSP messages and unrelated accounting/vehicles 403 responses remained outside this change.

## Independent review

- Architecture, SQL/tenant isolation, UI/test quality, and security reviews completed.
- Final correctness and security re-reviews found no remaining Critical, High,
  or Medium issue. The last review specifically confirmed the Fund DEK CAS,
  legacy-key promotion CAS, atomic administrator provider/key update, Postmark
  provider filtering, and shared outbound header validation boundaries.
