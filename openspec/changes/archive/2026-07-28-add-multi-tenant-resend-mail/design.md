## Context

Reporting already has a provider-neutral outbound helper, Fund envelope encryption, Postmark/Mailgun inbound adapters, an `inbound_emails` processing pipeline, Deal intake, and a secure expert-invitation workflow. Resend is currently outbound-only and stored in the client-readable `fund_settings` row as ciphertext; there is no Resend inbound signature boundary, mailbox identity, durable thread, atomic provider-event claim, or `Reply-To` support.

The product model has two deliberately separate trust domains:

1. FundWorkspace owns `fundworkspace.com` and sends authentication and platform notifications.
2. Each Fund owns a separate Resend account for exactly `<fund-slug>.fundworkspace.com` and gives FundWorkspace tenant-scoped credentials (BYOK).

Inbound Resend webhooks contain only metadata; the application must authenticate the raw webhook and then use the matching Fund account's receiving-capable key to retrieve body, headers, and attachments. Email is hostile external input and must not become Diligence evidence or an expert submission merely because it arrived at a trusted-looking address.

## Goals / Non-Goals

**Goals:**

- Keep platform and Fund Resend credentials, reputation, quotas, and call paths strictly separated.
- Give each Fund one immutable DNS-safe mail slug and exact derived subdomain.
- Give each user an optional unique local-part mailbox within their Fund, plus reserved shared `pitch` and `expert` mailboxes.
- Authenticate and idempotently receive Resend email for a Fund without trusting the webhook body to select a tenant.
- Route replies with both a high-entropy per-message `Reply-To` token and RFC `Message-ID` headers, quarantining disagreement.
- Reuse existing Deal intake for public pitches and existing expert invitation/link submission for expert validation.
- Keep secrets service-role-only and encrypted with Fund-bound AAD.

**Non-Goals:**

- Building an IMAP/POP server, synchronizing to third-party mailbox clients, or pretending Resend is a conventional hosted mailbox.
- Treating an email reply as the immutable expert-validation answer; the existing fragment-token response page remains authoritative.
- Automatically importing general mailbox attachments into a Diligence data room.
- Provisioning Resend accounts or DNS records on behalf of a Fund, bypassing Resend plan limits, or falling back between platform and Fund accounts.
- Rendering untrusted inbound HTML in the first version; the API exposes safe plain text and attachment downloads only.

## Decisions

### 1. Separate platform mail from Fund BYOK mail

Platform mail uses only server environment variables: `RESEND_API_KEY`, `SYSTEM_EMAIL_FROM`, and `FUND_EMAIL_BASE_DOMAIN`. `sendPlatformEmail()` fails closed when the key or an exact base-domain sender is missing. Supabase Auth uses Resend SMTP configured separately with a distinct sending-only key; the application cannot make Supabase Auth use the Resend HTTP client.

Fund mail resolves the selected Fund provider and credential by `fund_id`. Missing Fund credentials never fall back to platform credentials, and platform mail never queries Fund credentials. The existing service-table Fund Resend ciphertext remains a read-only compatibility fallback only when no current provider setting exists; any explicit non-Resend provider selection disables that fallback.

Alternative considered: one Resend account containing every Fund subdomain. Rejected because the free-plan domain limit, shared reputation, shared suspension risk, and cross-tenant credential blast radius conflict with the agreed tenant model.

### 2. Keep provider selection authoritative in `fund_settings` and receiving secrets service-only

The existing `fund_settings.outbound_email_provider`, `fund_settings.inbound_email_provider`, and `fund_settings.resend_api_key_encrypted` fields remain the authoritative outbound provider contract. Resend is already a supported outbound provider, so Fund mail must not create a second settings card or a second active sending-key source.

`fund_email_provider_credentials` contains the service-only Resend receiving connection metadata per Fund: exact derived domain, encrypted receiving-capable key, encrypted webhook signing secret, SHA-256 webhook route token, state, and audit timestamps. It enables RLS, grants no access to `anon` or `authenticated`, and is read only with the service-role client. Its existing sending-key column is legacy compatibility state only: new Settings writes use `fund_settings.resend_api_key_encrypted`, outbound resolution prefers that existing provider path, and a successful replacement clears the legacy copy.

Each secret is AES-256-GCM encrypted under the existing per-Fund DEK with AAD `fund-email:v1:<fund_id>:<field>`. The route token is 32 random bytes returned only when created or rotated; only its hash is stored. Settings returns configured booleans, domain, and timestamps, never ciphertext or plaintext secret values.

Alternative considered: put the receiving-capable key in `fund_settings` beside the sending key. Rejected because Fund members can select that row and the receiving key is full-account access. This does not justify duplicating the already-existing sending-only key.

### 3. Derive the exact Fund domain from an immutable slug

`funds.email_subdomain` is a normalized DNS label with a global case-insensitive unique constraint. Reserved infrastructure labels are rejected in the API. The server derives `<slug>.<FUND_EMAIL_BASE_DOMAIN>` and never accepts an arbitrary full domain from a client. Once a Resend connection exists, the slug cannot change until the connection is explicitly removed.

### 4. Model mailboxes, threads, messages, and reply routes explicitly

- `fund_email_mailboxes` maps `(fund_id, local_part)` to either one Fund user or a reserved shared purpose (`pitch`, `expert`, `shared`). User local parts are unique only inside their Fund.
- `fund_email_threads` owns the Fund, mailbox, subject, optional business context type/id, and status.
- `fund_email_messages` records inbound/outbound provider IDs, RFC message headers, addresses, safe text, optional raw HTML storage, routing status, and linkage to the existing `inbound_emails` row.
- `fund_email_reply_routes` maps only `SHA-256(raw_token)` to one Fund/thread/mailbox, with expiry and revocation. Raw tokens are never persisted or logged.

All cross-table relationships use composite `(id, fund_id)` keys so service-role bugs cannot join objects from different Funds. These infrastructure tables are service-only; authenticated APIs re-derive current membership and filter every query by `fund_id`.

### 5. Generate sender and reply identities only on the server

Clients choose an owned mailbox or invoke an already-authorized business action; they cannot submit arbitrary `From`, `Reply-To`, or RFC routing headers. The server validates all addresses and rejects control characters. Expert invitation delivery receives the initiating user ID from the existing Diligence write gate, selects that user's mailbox when present, otherwise uses the shared `expert` mailbox, and creates the thread/reply route before sending.

Every new outbound thread message creates a 160-bit lowercase hexadecimal reply token and sends:

```text
From: Alice <alice@cci.fundworkspace.com>
Reply-To: r_<token>@cci.fundworkspace.com
```

Provider retries reuse one persisted outbox message and one stable Resend idempotency key. Subsequent messages also set `In-Reply-To` and `References` from stored RFC message IDs.

### 6. Resolve the tenant before verifying content, then verify raw bytes

The webhook URL is `<FUND_EMAIL_WEBHOOK_BASE_URL>/api/inbound-email/resend/<route-token>`. All Funds may share one operator-owned HTTPS/Tunnel origin, while the unguessable path token and per-Fund signing secret preserve tenant isolation. The dedicated server-only origin falls back to `NEXT_PUBLIC_SITE_URL` for compatibility. The handler hashes the path token and resolves exactly one enabled connection before reading or parsing JSON. It reads the bounded raw body, verifies the Svix headers with that connection's secret, and only then parses the event. Unknown routes return a generic 404; missing/invalid signatures return 401.

The handler accepts signed `email.received` events, atomically claims both `(connection_id, svix_id)` and `(connection_id, provider_email_id)`, retrieves content from the fixed Resend SDK, and validates that the signed and fetched recipient lists agree and include the configured exact domain. Different signed events for the same provider email are still one message. Failed retrieval is retryable; completed or actively leased work is acknowledged without duplicate processing.

Alternative considered: choose a Fund by the unverified recipient domain. Rejected because the signing key cannot be selected from attacker-controlled content.

### 7. Use explicit inbound routing policies

Routing order is:

1. a valid `r_<token>` route in the same Fund and domain;
2. unambiguous `In-Reply-To` / `References` match in the same Fund;
3. an exact known mailbox local part;
4. quarantine/unroutable.

If token routing and RFC header routing identify different threads, the message is quarantined rather than choosing either. Unknown, expired, revoked, or cross-Fund reply tokens confer no identity or authorization.

`pitch@<fund-domain>` accepts arbitrary external senders into the existing inbound Deal screening boundary with `intro_source = email`; it does not enter Diligence evidence automatically. Other known mailboxes store a thread message but do not run the portfolio-report extraction pipeline. Unknown local parts are acknowledged as unroutable without cross-mailbox fallback.

### 8. Fail closed for attachments and HTML

The Resend adapter limits event bytes, recipient counts, attachment count, per-attachment bytes, and total attachment bytes before storage. Attachment downloads use only the Resend SDK metadata, an HTTPS allowlist, no redirects, timeouts, streamed byte bounds, malware/type scanning, and the existing private bucket. Unsafe, unreadable, oversized, or failed-storage attachments quarantine the message; base64 content is never stored in JSON as a fallback.

Inbound HTML remains stored as untrusted source data but is not rendered by the mailbox API. The safe first-version display body is plain text. External content remains an untrusted-evidence container for any later AI processing.

### 9. Extend the existing provider selectors and own the Resend webhook lifecycle

The existing Settings page already separates outbound and inbound email and already exposes Resend as an outbound provider. Fund Resend extends those exact provider controls instead of rendering additional `Section` cards:

- The existing outbound selector keeps `resend` alongside Postmark, Mailgun, Gmail, and none. Its Resend branch accepts the immutable Fund mail slug and the existing Resend sending-only key field. Saving uses the existing `/api/settings` provider contract and `fund_settings.resend_api_key_encrypted`; it does not require or expose inbound credentials and does not write a second active sending-key copy.
- The existing inbound selector adds `resend` alongside Postmark, Mailgun, and none. Its Resend branch accepts the same immutable slug only when no Fund mail domain exists and a Full Access key. The server derives and validates the public webhook URL, creates an `email.received` webhook with the Resend Webhooks API, stores the returned webhook ID and encrypted signing secret, and never asks the administrator to paste a signing secret.
- The current user's Fund mailbox identity is presented as the sender-identity part of the existing outbound email experience, not as another provider connection.
- Either side may be configured first. A metadata-only service row may reserve the immutable Fund domain before inbound is configured; the active outbound credential remains in `fund_settings`, while receiving is usable only when its complete encrypted webhook bundle is present and its status permits the action.

Initial inbound configuration validates all local input and the server-configured public HTTPS origin, inspects the Resend domain, creates one provider webhook, and atomically persists the receiving key, returned signing secret, route hash, and provider webhook ID. If persistence fails, the server best-effort removes that newly created endpoint.

Resend Free permits only one webhook endpoint, so recreation never uses create-before-delete for a managed connection. The server retrieves and updates the existing provider webhook in place, keeping the same high-entropy route while forcing the endpoint onto the current server-configured HTTPS origin, then retrieves and encrypts its signing secret. A legacy connection without a provider ID is adopted by listing webhooks and matching only the SHA-256 hash of the route token parsed from the exact inbound path; the complete endpoint is then rewritten and verified against the current origin. If no match exists, the provider may create the first managed endpoint.

Disconnect is a two-phase fenced receiving-only operation. A service-role RPC first compares the provider ID and `updated_at` revision, marks receiving failed, and returns a disconnect revision; this immediately revokes verified route resolution and makes concurrent recreation fail its own revision check. Provider deletion treats not-found as success. A second RPC clears only the receiving key, webhook secret, route hashes, and provider webhook ID when the row still matches the revision. The immutable Fund slug, domain identity, mailboxes, outbound provider, and outbound key remain intact. If provider deletion fails, the failed receiving row retains the encrypted key and provider ID so the administrator can retry safely.

The provider webhook ID is service-only metadata, not a credential. GET responses expose only capability booleans, provider-webhook configuration status, domain/DNS status, and timestamps. They never expose API keys, signing secrets, ciphertext, route tokens, or caller-selected tenant identity.

## Risks / Trade-offs

- **[BYOK onboarding is partly manual]** Each Fund must create a Resend account and DNS records → Settings provides the exact domain, required credential fields, and status; FundWorkspace creates/recreates the webhook after the administrator supplies a Full Access key.
- **[Receiving requires a broad Resend key]** Resend lacks receive-only keys → store a separate receiving-capable key in the service-only credentials table and use a sending-only key for outbound.
- **[Webhook crash window]** Processing can stop after claim → lease and attempt fencing allow a failed/expired claim to retry while completed work remains idempotent.
- **[Catch-all spam]** Resend receives any local part → only registered mailboxes are routed, public pitch enters screening, and unknown addresses do not trigger business pipelines.
- **[Reply alias visibility]** Recipients may see `r_<token>` when replying → use it only as routing metadata and preserve the human sender in `From`.
- **[No conventional mailbox client]** Resend does not provide IMAP/POP → FundWorkspace remains the mail UI and source of thread state.
- **[External-service verification]** CI cannot prove DNS or delivery → unit/integration tests cover contracts and a real BYOK account is required for the final live-send/reply check.
- **[Resend Free has one webhook endpoint]** Creating a second endpoint would fail → keep one endpoint per Fund account and update or adopt it in place.

## Migration Plan

1. Add service-only connection/mail tables, exact constraints, event-claim functions, `funds.email_subdomain`, and typed database definitions.
2. Add credential/domain/mailbox/thread services and tests without changing existing production callers.
3. Add Resend outbound capabilities and the signed inbound route; register its explicit access-domain exception.
4. Extend the existing outbound/inbound provider branches with the slug, receiving status, and mailbox identity; keep the existing outbound Resend key path, create reserved mailboxes, and manage the Resend webhook/signing secret automatically.
5. Move platform notifications/contact mail to `sendPlatformEmail()` and document Resend SMTP for Supabase Auth.
6. Move expert invitations to the Fund thread sender and add pitch routing.
7. Verify with isolated local fixtures, then one real platform account and one real Fund account.

Rollback disables Fund Resend connections and removes the webhook endpoint from Resend. Existing message/thread audit rows remain private and readable after rollback; legacy providers and invitation copy-link fallback continue to work.

## Open Questions

None. A standalone full mailbox UI can be layered on the service/API later; it is not required to establish the secure receiving, routing, pitch, and expert-invitation paths in this change.
