# Timezone Preference Verification Report

## Outcome

The feature path is implemented and the requested timezone behavior is
verified: timestamps are stored unchanged, server and client rendering use one
explicit request timezone, the browser can detect its IANA timezone, and an
authenticated user can override or reset that preference.

## Focused verification

- `npx vitest run tests/time-zone-*.test.ts tests/time-zone-*.test.tsx tests/settings-localization.test.ts tests/fund-identity-onboarding-ui.test.ts tests/onboarding-setup-localization.test.ts`
  passed 10 files and 117 tests during the final reconciliation pass.
- `npx vitest run tests/time-zone-hydrated-formatters.test.ts` passed 16 tests;
  the covering provider/bootstrap/settings run passed 4 files and 50 tests.
- Changed-file ESLint passed across the complete hydrated timestamp audit with
  zero errors and one inherited `no-img-element` warning in Settings.
- `npx openspec validate add-user-timezone-preferences --strict` passed.
- `git diff --check` passed.
- `supabase db reset` passed after the additive timezone migration was made
  safe for the existing `current_utc_time()` return-type change.

The final hydrated formatter audit inventories all 218 `use client` modules.
It rejects native `Intl.DateTimeFormat`, `toLocaleDateString`, and
`toLocaleTimeString` presentation paths, except for two explicitly classified
`resolvedOptions().timeZone` browser-detection calls. Timestamp paths across
Deals, LP Messages/Activity/Documents, Pending Actions, Letters, Notes,
Compliance, Email/Review, Search, Invitations, Settings, and Memo Agent now use
the request-scoped next-intl formatter. Calendar-only and business-period
values use the same formatter with explicit UTC semantics. Every client-side
`toLocaleString` call is also counted and must match one of four explicitly
classified numeric-formatting modules. LP Activity has a dedicated source
contract that rejects the removed `formatDateTime` helper and asserts both
`lastSeen` and event `createdAt` call `format.dateTime` at their exact use sites.

`npx tsc --noEmit` reports only the known unrelated
`tests/platform-landing-logo-assets.test.ts:39` TS2802 baseline error; it reports
no LP Activity or timezone-audit error.

The final whole-branch review added two server-rendered timestamp contracts:
Email Detail `received_at` and Memo Schema `edited_at` now use next-intl
`getFormatter()`, so their server output consumes the same request timezone.
Three client calendar decisions (Compliance current month, New Letter year, and
Add Data Point year) use `calendarPartsInTimeZone()` with `useTimeZone()` and a
UTC fallback. Pure tests prove the same instant resolves to December 2026 in
UTC and January 2027 in Asia/Shanghai. The audit claims only these enumerated
server paths plus the scanned client presentation patterns.

The Compliance API now takes one current-time snapshot and derives its
date-only cash-flow query year with `getUTCFullYear()`. It classifies ISO
`flow_date` months with `getUTCMonth()`, preventing January 1 from becoming
December on a west-of-UTC server. The route contract and boundary behavior are
covered by `tests/time-zone-compliance-route.test.ts`.

## Browser verification

The real tenant application was exercised through an isolated development
entrypoint using a browser process configured for `Asia/Shanghai`.

- Automatic mode set a host-only, HttpOnly, SameSite=Lax timezone cookie and
  rendered `2026-07-25T18:00:00Z` as July 26.
- Manual UTC rendered the same instant as July 25 and remained correct after a
  reload.
- Resetting to Automatic restored `Asia/Shanghai` and July 26.
- A separate tenant hostname had no access to the first tenant's cookie,
  performed one synchronization request and one controlled reload, and then
  retained its own host-only preference.
- No date/time text hydration mismatch, failed timezone request, or reload loop
  was observed.

Screenshots:

- `.harnesskit/evidence/add-user-timezone-preferences/automatic-asia-shanghai.png`
- `.harnesskit/evidence/add-user-timezone-preferences/boundary-date-asia-shanghai.png`

Machine-readable assertions, including explicit missing-screenshot status for
manual UTC, reload, reset, and tenant isolation, are recorded at
`.harnesskit/evidence/add-user-timezone-preferences/browser-assertions.json`.
Those missing dedicated screenshots are one reason item 5.3 remains open.

## Review and security

Scoped code, database, and security review found no unresolved blocker or high
finding. Mutation bodies are bounded and exact-shape validated; manual writes
require authentication; origins/hosts are checked; invalid zones fail closed;
and cookies are host-only, HttpOnly, SameSite=Lax, finite-lived, and Secure in
production. The migration remains additive and does not rewrite stored
timestamps. No dependency or lockfile changed.

Personal Settings GET now rejects an untrusted Host before service-role reads;
PATCH requires the same reusable trusted Host/same-origin boundary used by the
timezone route. Missing sessions remain 401, while operational authentication
errors return a sanitized 503 before an admin client is created.

`TIME_ZONE_PROFILE_INTEGRATION=true npx vitest run tests/time-zone-profile.integration.test.ts`
passed against local Supabase. Its disposable users prove nullable manual/reset
RPC updates preserve `full_name`, owner SELECT remains effective, cross-user
SELECT is empty, authenticated direct UPDATE and RPC execution are denied, and
the service-role RPC succeeds. Cleanup removed both users. The migration is
documented as a ledger-managed one-shot Supabase migration.

Final focused verification passed 9 files and 112 tests; the environment-gated
database integration passed 1 additional test. Changed-file ESLint, strict
OpenSpec, and `git diff --check` pass. TypeScript reports only the known
platform-landing TS2802 baseline.

The final repository Vitest run passed 316 files / 2,249 tests, skipped 5 files
/ 9 tests, and left only the four documented platform-landing baseline failures
across two files. Compliance and Letters localization contracts now assert the
request-scoped formatter/timezone architecture, and the Search component test
mock supplies `useFormatter`; those three previously stale files pass 12/12
without changing their product behavior assertions.

## Remaining repository baselines

- `npx tsc --noEmit` is blocked by the existing
  `tests/platform-landing-logo-assets.test.ts:39` TS2802 iterator/target error.
- HarnessKit fast/full stop on the existing unsupported
  `feed-discovery: complete` state; targeted verification reaches existing
  repository-wide lint debt. Changed-scope lint passes.
- Production build reaches type checking and is blocked by existing test type
  debt, including `tests/api/platform-user-profile.test.ts:23`.
- `npm audit --omit=dev` reports the repository's existing advisories,
  including the no-fix `xlsx` advisory; this change adds no dependency.
- The app still emits a pre-existing `next-themes` root-class hydration warning.
  The OpenSpec intentionally does not hide it with
  `suppressHydrationWarning`; timezone/date content itself hydrates consistently.

For those reasons OpenSpec items 5.3 and 5.4 remain open rather than presenting
the repository-wide release gates as green.
