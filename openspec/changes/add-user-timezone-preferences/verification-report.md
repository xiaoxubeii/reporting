# Timezone Preference Verification Report

## Outcome

The feature path is implemented and the requested timezone behavior is
verified: timestamps are stored unchanged, server and client rendering use one
explicit request timezone, the browser can detect its IANA timezone, and an
authenticated user can override or reset that preference.

## Focused verification

- `npx vitest run tests/time-zone-*.test.ts tests/time-zone-*.test.tsx tests/settings-localization.test.ts tests/fund-identity-onboarding-ui.test.ts tests/onboarding-setup-localization.test.ts`
  passed 10 files and 117 tests during the final reconciliation pass.
- `npx vitest run tests/time-zone-hydrated-formatters.test.ts` passed 5 tests.
- Changed-file ESLint passed for the audited hydrated timestamp components and
  their regression test.
- `npx openspec validate add-user-timezone-preferences --strict` passed.
- `git diff --check` passed.
- `supabase db reset` passed after the additive timezone migration was made
  safe for the existing `current_utc_time()` return-type change.

The hydrated formatter audit removed local-browser and pinned-UTC formatting
from timestamp paths in Deals, Relationships, Email Routing, and Memo Agent.
Calendar-only values continue to use explicit timezone-neutral semantics.

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

## Review and security

Scoped code, database, and security review found no unresolved blocker or high
finding. Mutation bodies are bounded and exact-shape validated; manual writes
require authentication; origins/hosts are checked; invalid zones fail closed;
and cookies are host-only, HttpOnly, SameSite=Lax, finite-lived, and Secure in
production. The migration remains additive and does not rewrite stored
timestamps. No dependency or lockfile changed.

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
