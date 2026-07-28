## 1. Persistence and Security Contracts

- [x] 1.1 Add RED migration security tests for a service-only Fund Resend connection, immutable Fund mail slug, Fund-scoped mailbox/thread/message/reply-route relationships, reply-token hashing, and atomic provider event/email idempotency.
- [x] 1.2 Add the migration, RLS/grants, composite tenant foreign keys, webhook claim/complete/fail functions, reserved mailbox creation support, and generated database types.
- [x] 1.3 Add opt-in local Supabase concurrency tests proving same-name mailbox isolation, cross-Fund relationship rejection, event lease/retry fencing, and one provider email per connection.

## 2. Connection, Domain, and Mailbox Services

- [x] 2.1 Add RED tests for exact derived Fund domains, reserved slug/local-part validation, service-only status responses, separate Fund credentials, Fund-bound AAD, and no platform fallback.
- [x] 2.2 Implement connection credential save/load/rotate/remove, exact-domain derivation, high-entropy webhook route generation, and safe status DTOs.
- [x] 2.3 Implement Fund mailbox creation/ownership resolution, reserved `pitch` and `expert` mailboxes, and per-user mailbox update with live membership checks.

## 3. Platform and Fund Outbound Mail

- [x] 3.1 Add RED tests for platform-only Resend configuration, exact platform sender validation, explicit Resend error handling, Reply-To/RFC headers/tags, stable provider idempotency, and log redaction.
- [x] 3.2 Extend the shared outbound contract and Resend adapter; add `sendPlatformEmail` and Fund connection resolution without cross-boundary fallback.
- [x] 3.3 Implement server-derived Fund sender identities, durable outbound thread/message/outbox records, high-entropy hashed reply routes, and subsequent RFC thread headers.

## 4. Signed Resend Inbound

- [x] 4.1 Add RED adapter tests for retrieving full Resend content, signed/fetched recipient consistency, header normalization, bounded attachment retrieval, and fail-closed errors.
- [x] 4.2 Add RED route tests for route-token-first connection resolution, exact raw-body Svix verification, domain isolation, database event/email idempotency, retry leases, and generic failures.
- [x] 4.3 Implement the Resend inbound adapter, attachment safety/storage boundary, deterministic token/header/mailbox routing, conflict quarantine, and the signed webhook route.
- [x] 4.4 Add the webhook's explicit access-domain decision and regression tests proving no Session bypass outside the handler's route-token plus signature contract.

## 5. Pitch and Expert Workflows

- [x] 5.1 Route `pitch@<fund-domain>` into one existing Fund-scoped Deal screening record while keeping it outside automatic Diligence evidence and allowing external founders.
- [x] 5.2 Extend expert invitation tests so the Session actor selects the Fund mailbox, the provider receives server-derived From/Reply-To, retries remain idempotent, and replies remain thread mail rather than expert submissions.
- [x] 5.3 Update expert invitation issuance and route context to create/use the Fund email thread while preserving token issuance, provider-failure sanitization, copy-link fallback, and one-time public submission.

## 6. Admin and User Settings

- [x] 6.1 Add RED Settings API tests for admin-only connection/slug changes, current-user mailbox updates, secret encryption, exact domain validation, explicit route rotation, and secret-free GET responses.
- [x] 6.2 Implement focused Fund email connection/mailbox APIs that derive Fund/user from Session and never accept caller-selected identity, Fund, From, or Reply-To.
- [x] 6.3 Add bilingual Settings controls for mail subdomain, separate Resend sending/receiving keys, webhook signing secret, one-time webhook URL rotation/copy, status, and current user's mailbox name.

## 7. Platform Configuration and Documentation

- [x] 7.1 Move platform contact/member-notification mail to `sendPlatformEmail` and verify Fund business mail never uses it.
- [x] 7.2 Document `.env` platform Resend configuration, a distinct Resend SMTP key for Supabase Auth, DNS records for root/Fund subdomains, shared `FUND_EMAIL_WEBHOOK_BASE_URL` Tunnel origin, BYOK onboarding, free-plan limits, webhook setup, rotation, and rollback.

## 8. Verification and Review

- [x] 8.1 Run focused unit, migration-security, route, localization, invitation, and opt-in database integration tests plus TypeScript and changed-scope lint.
- [x] 8.2 Run strict OpenSpec validation, HarnessKit fast/targeted/full tiers, secret scan, `git diff --check`, and production build; resolve in-scope failures.
- [x] 8.3 Run independent correctness and security re-reviews and address every Critical/High finding.
- [x] 8.4 Exercise the real local authenticated Settings and expert-invitation paths, then record the external DNS/Resend live send-and-reply check as completed or explicitly blocked by missing user-owned credentials.

## 9. Split Settings and Managed Webhook Lifecycle

- [x] 9.1 Add RED migration, service, API, and UI contract tests for staged outbound/inbound configuration, nullable capability secrets, service-only provider webhook IDs, automatic signing-secret capture, and removal of the manual webhook-secret field.
- [x] 9.2 Add the forward-only migration and credential/webhook services so either sending or receiving may be configured first, while outbound/inbound loaders fail closed unless their own capability is complete.
- [x] 9.3 Replace the standalone Fund email form with bilingual Fund Resend controls inside the existing outbound/inbound email groups; make inbound setup/recreation call the Resend Webhooks API and preserve mailbox management under inbound settings.
- [x] 9.4 Run focused tests, TypeScript, lint, strict OpenSpec/HarnessKit checks, secret scan, independent correctness/security reviews, and the real authenticated Settings browser flow.

## 10. Integrate Resend into Existing Provider Settings

- [x] 10.1 Add RED UI/API/runtime contract tests proving outbound reuses the existing Resend provider/key, inbound adds `resend` to the existing provider selector, provider-specific fields render conditionally, and no standalone Fund Resend cards or duplicate active sending-key writes remain.
- [x] 10.2 Add the forward-only inbound-provider constraint migration and refactor provider resolution so `fund_settings` is authoritative for outbound Resend while the service-only connection retains receiving/webhook state and legacy sending-key compatibility only.
- [x] 10.3 Merge Resend domain, Full Access key, webhook/DNS status, and mailbox identity into the existing outbound/inbound email sections; remove the independent Fund Resend sections without changing Postmark, Mailgun, or Gmail behavior.
- [x] 10.4 Run focused and regression tests, TypeScript, changed-scope lint, strict OpenSpec/HarnessKit tiers, secret/diff checks, production build, independent correctness/security reviews, and the real authenticated provider-selection browser flow.
