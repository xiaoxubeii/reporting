## Why

Reporting can send through a Fund-configured provider and ingest Postmark or Mailgun webhooks, but it cannot operate the planned FundWorkspace mail model: platform-owned authentication/notification mail on `fundworkspace.com`, independently owned Fund mail on `<fund>.fundworkspace.com`, or reliable reply-to-thread routing. As a result, Fund accounts cannot receive pitches or keep expert-invitation replies inside the correct tenant and business context.

## What Changes

- Establish a platform Resend boundary for FundWorkspace notifications and document the Resend SMTP configuration required by Supabase Auth.
- Add Fund-owned Resend BYOK configuration for one verified subdomain, a domain-scoped sending key, a receiving-capable key, and a signed inbound webhook.
- Add Fund mailbox aliases and durable email threads/messages so local parts identify internal mailboxes and high-entropy reply aliases identify business threads.
- Extend the shared outbound email contract with `Reply-To`, RFC thread headers, tags, provider idempotency, and explicit provider-error handling.
- Add a signed, tenant-resolved Resend inbound route that retrieves body and attachments, verifies domain and recipient routing, rejects cross-Fund configuration, and processes webhook retries idempotently.
- Route `pitch@<fund>.fundworkspace.com` into the existing Deal intake boundary and route tokenized replies into their existing Fund email thread without treating an email reply as a submitted expert-validation answer.
- Send expert invitations from the initiating member's Fund mailbox identity with a tokenized reply address while retaining the existing secure response-link workflow.
- Extend the existing outbound/inbound provider selectors instead of adding parallel Fund Resend cards: outbound keeps Resend's existing provider/key path, while inbound adds Resend and uses a Full Access key to create and rotate the signed webhook automatically without asking the administrator to copy a signing secret.
- Keep per-user mailbox identity inside the existing outbound email experience with bilingual setup guidance and no plaintext secret disclosure.

## Capabilities

### New Capabilities

- `multi-tenant-email`: Platform and Fund Resend configuration, Fund mailbox identities, outbound delivery, signed inbound receiving, and durable message/thread routing.

### Modified Capabilities

- None.

## Impact

- Adds database migrations and generated types for Fund Resend credentials, mailbox aliases, threads, messages, and webhook-event idempotency.
- Extends `lib/email.ts`, the existing inbound email normalization/pipeline boundary, and expert invitation delivery.
- Adds Resend webhook and authenticated Fund mail APIs while extending the existing provider Settings UI/localization contracts rather than introducing a second settings surface.
- Adds server environment and Supabase Auth SMTP documentation for the platform-owned Resend account.
- Requires encrypted server-side storage of Fund API keys and webhook secrets; no Resend credential is exposed to browsers or models.
