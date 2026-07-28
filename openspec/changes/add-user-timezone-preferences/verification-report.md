# User timezone preferences verification report

## Outcome

The feature is complete and merge-ready. Stored timestamp instants remain UTC;
validated IANA timezone preferences affect display and calendar decisions only.
Automatic browser detection, a manual override, reset to Automatic, reload
persistence, request-scoped server/client agreement, and sibling-host cookie
isolation all passed through the real application and local Supabase session.

## Feature verification

- The final focused run passed 13 files and 185 tests; one environment-gated
  test file/test was skipped by its declared gate.
- The local-Supabase profile integration previously passed with disposable
  users and proved owner-only reads, denied direct browser writes/RPC execution,
  service-role updates, nullable reset semantics, and exact cleanup.
- Changed-scope ESLint checked 65 TypeScript/TSX files with zero errors and one
  inherited `no-img-element` warning in Settings.
- `npx openspec validate add-user-timezone-preferences --strict` passes.
- `./.harnesskit/scripts/verify-fast.sh` passes.
- `git diff --check` passes.
- `npx tsc --noEmit` reaches only the unrelated existing TS2802 iterator/target
  error in `tests/platform-landing-logo-assets.test.ts:39`.

The source-contract audit covers all client date presentation paths. Native
locale formatting is rejected unless it is explicitly classified as timezone
detection or non-date numeric presentation. Server-rendered Email Detail and
Memo Schema timestamps consume the request-scoped formatter. Compliance date
queries and business-period calendar decisions use explicit UTC or the resolved
display timezone according to their domain contract.

## Browser acceptance

Chromium exercised the real tenant application at port 6300 with the browser
configured for `Asia/Shanghai` and an authenticated local-Supabase session.

- Automatic mode persisted a host-only, HttpOnly, SameSite=Lax cookie and
  rendered `2026-07-25T18:00:00Z` as July 26.
- Manual UTC immediately rendered the same instant as July 25.
- Reload preserved manual UTC and the July 25 boundary result.
- Resetting to Automatic restored `Asia/Shanghai` and July 26.
- A sibling tenant hostname did not receive the authenticated session or the
  first host's timezone cookie.
- The accepted flow produced zero uncaught runtime errors, hydration warnings,
  timezone mutation failures, and reload loops.

Machine-readable results are in
`.harnesskit/evidence/add-user-timezone-preferences/browser-assertions.json`.
Screenshots:

- `automatic-asia-shanghai.png`
- `automatic-asia-shanghai-merge.png`
- `boundary-date-asia-shanghai.png`
- `manual-utc-selection.png`
- `manual-utc-reload.png`
- `reset-automatic-asia-shanghai.png`
- `tenant-host-isolation.png`

## Review and security

Scoped code, database, and security review found no unresolved blocker or high
finding. Mutation bodies are bounded and exact-shape validated; writes require
authentication and trusted Host/same-origin checks; invalid zones fail closed;
cookies are host-only, HttpOnly, SameSite=Lax, finite-lived, and Secure in
production. The additive migration does not rewrite stored timestamps.

The post-main-merge hydration regression was closed by removing the redundant
body-level suppression and adding `tests/root-layout-hydration.test.ts`. The
automatic client synchronization uses a deterministic zero-delay task and
retains cancellation cleanup.

## Repository-wide release baseline

All required release commands were executed. Their unrelated repository gaps
are recorded separately from the passing feature scope:

- Full Vitest: 330 files / 2,334 tests passed, five files / nine tests skipped,
  and only four existing platform-landing assertions failed across two files.
- `npm run lint` and HarnessKit targeted verification reach existing
  repository-wide ESLint debt outside this feature; changed-scope lint has zero
  errors.
- `npm run build` stops when Next invokes that same repository-wide lint debt.
  `next build --no-lint`, with the existing local Supabase environment supplied
  only to the child process, compiled successfully, generated all 277 pages,
  collected build traces, and exited 0.
- Production dependency audit reports the existing baseline of 19 advisories:
  15 high and four moderate. This feature changes no dependency manifest or
  lockfile.
- TypeScript has the single platform-landing TS2802 baseline noted above and no
  timezone error.

These baselines remain repository maintenance work; none is introduced by the
timezone branch or invalidates its focused, integration, build-compilation, or
browser acceptance evidence.
