# Comprehensive site E2E

Run the real Web and Cron entrypoints plus the serial Playwright suite:

```bash
npm run test:e2e
```

Install the Playwright-managed Chromium once before the first run:

```bash
npx playwright install chromium
```

The suite intentionally uses the browser revision paired with the installed
Playwright version. Set `E2E_CHROMIUM_EXECUTABLE` only when a controlled CI
image provides a verified compatible executable.

The runner uses `devctl.sh`, allocates an isolated 10-port block, reuses configured
external Miniflux, SearXNG, and Supabase dependencies, and stops only services it
started. Set `E2E_KEEP_SERVICES=1` to keep those processes alive for diagnosis.
The local Supabase schema must have all repository migrations applied. Cleanup is
restricted to localhost fixtures; when immutable Fund identity is installed it uses
the local database container named by `E2E_SUPABASE_DB_CONTAINER` (default:
`supabase-db`) to remove only a row matching the generated Fund UUID, name, slug,
and email subdomain inside a transaction.

Useful focused forms:

```bash
npm run test:e2e -- tests/e2e/platform-smoke.spec.ts
npm run test:e2e:headed
npm run test:e2e:ui
```

Optional variables:

- `E2E_BASE_URL`: reuse an already running Web entrypoint.
- `E2E_CHROMIUM_EXECUTABLE`: explicit Chromium binary; otherwise a local system
  Chromium is used when present and Playwright's installed browser is the fallback.
- `E2E_KEEP_SERVICES=1`: do not stop services created by the runner.
- `E2E_SUPABASE_DB_CONTAINER`: local Supabase Postgres container used only for
  bounded cleanup of disposable E2E Fund identities.
- `E2E_INVESTMENT_PROVIDER`: override the default deterministic local provider
  with `anthropic`, `openai`, `gemini`, `ollama`, or `openrouter`.
- `E2E_INVESTMENT_PROVIDER_API_KEY` and `E2E_INVESTMENT_PROVIDER_MODEL`: required
  when the provider opt-in is set. `E2E_INVESTMENT_PROVIDER_BASE_URL` is also
  required for `openrouter` and `ollama`; remote URLs must be HTTPS and local
  Ollama-compatible URLs may use HTTP. With no override, the runner starts an
  ephemeral loopback-only OpenAI-compatible fixture and records `ollama`.
- `E2E_ALLOW_REAL_MAIL_DELIVERY=true`: explicitly allow the Contact E2E scenario
  to send through Resend. This is disabled by default even when provider secrets
  exist. Enabling it sends to `CONTACT_EMAIL` (or the product default when unset),
  so use only a controlled test inbox. It takes effect only when both
  `RESEND_API_KEY` and `SYSTEM_EMAIL_FROM` are configured.

HTML, JSON, screenshots, videos, and traces are written under
`.harnesskit/evidence/comprehensive-site-e2e/` and are intentionally ignored by Git.
Environment secrets and disposable fixture credentials must never be attached.
Each run also writes a redacted `capabilities.json`: Web, Cron, Supabase, Miniflux,
SearXNG, and Chromium are required; AI and mail providers are recorded as
`configured` or `unconfigured`, and real platform-mail delivery is separately
recorded as `enabled` or `disabled`. Without the explicit delivery opt-in, the
Contact scenario exercises an accept-and-discard boundary and cannot address the
real contact inbox. A partial or invalid explicit Discovery provider configuration
fails the preflight without recording its key.
