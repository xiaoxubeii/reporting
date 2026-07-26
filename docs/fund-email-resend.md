# FundWorkspace Resend email deployment

Fund email is split into two distinct trust boundaries. Platform mail such as Supabase Auth and system notifications uses operator-owned credentials; Fund business mail uses only that Fund's encrypted Resend configuration. Never reuse a platform credential as a Fund fallback.

## Platform configuration

Set these server-only environment variables on the Web and Cron processes:

```dotenv
RESEND_API_KEY=
SYSTEM_EMAIL_FROM="FundWorkspace <system@example.com>"
FUND_EMAIL_BASE_DOMAIN=mail.example.com
FUND_EMAIL_WEBHOOK_BASE_URL=https://hooks.example.com
```

Keep these values out of `NEXT_PUBLIC_*`. Supabase Auth should use its own SMTP or provider configuration and a distinct sending identity. Restart both application processes after rotating platform values.

## Per-Fund configuration

Each Fund configures its domain and sending API key in Settings. The sending API key is stored encrypted and must have only the permission needed to send. Receiving uses a separate full-access receiving API key so the server can create or replace the Fund's `email.received` webhook and store the returned signing secret. The API exposes only status, including `sending_access`; it never returns either key or the webhook secret.

A domain becomes verified only after Resend accepts that real send. A successful DNS lookup alone is not treated as provider verification.

## DNS

For each Fund email subdomain, publish and verify the records supplied by Resend:

- SPF authorizes the provider's sending infrastructure.
- DKIM authenticates signed outbound messages.
- MX routes inbound mail to the provider.
- DMARC defines alignment and reporting policy after SPF and DKIM pass.

Use a separate subdomain per Fund. Do not point multiple Funds at the same inbound route token or provider domain.

## Webhook ingress

Route the public webhook hostname to the application without rewriting the request body. The handler verifies the exact raw Svix payload before parsing it. Requests with an unknown route token intentionally return `http_status:404`.

Example Cloudflare Tunnel checks:

```bash
cloudflared tunnel ingress validate
sudo systemctl enable --now cloudflared
```

Harden the service unit where supported:

```ini
[Service]
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
```

Ensure the proxy preserves the original HTTPS scheme and trusted host. Do not log route tokens, signatures, raw message bodies, or decrypted credentials.

## Provider setup and limits

Create the sending API key before the receiving API key and keep them distinct. Configure the provider webhook for `email.received` only. Apply provider and application limits together: reject messages larger than 3,000 KB after bounded retrieval and cap any one processing batch at 100 items.

## Rotation and rollback

Rotate one boundary at a time:

1. Stage the new sending key and run a real send.
2. After the provider accepts the send, promote the new key.
3. Replace the receiving key, recreate the webhook, and confirm a signed inbound event.
4. Revoke the old provider keys only after both paths pass.

For rollback, restore the previous encrypted Fund credential version or platform environment value, restart Web and Cron, and verify one outbound message. Webhook rollback must restore the matching route and signing-secret pair atomically; never mix an old secret with a new webhook.
