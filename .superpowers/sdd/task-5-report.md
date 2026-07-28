# Task 5 Report: Personal settings override

## Status

Completed on `codex/user-timezone-preferences` in
`/home/ubuntu/workspace/reporting-timezone`.

Implementation commit: `0453ab88` (`feat: add personal timezone preference`).

## Implemented

- Personal Settings GET continues returning the shared profile and now exposes
  its committed nullable `timeZone` field to the page state.
- Personal Settings PATCH accepts exactly one of `fullName`,
  `mailboxLocalPart`, or `timeZone`; timezone writes use the existing validated
  service-backed profile repository. `null` selects Automatic.
- Existing name and mailbox branches, membership checks, and mailbox creation
  semantics remain unchanged.
- Added an accessible preferences form with localized Automatic/manual radio
  controls, a labeled IANA input, native datalist suggestions, Enter-key form
  submission, disabled saving state, and inline error feedback.
- Suggestions use `Intl.supportedValuesOf('timeZone')` when available and always
  include validated UTC, current manual, and detected-browser fallbacks.
- Saving is deliberately sequential: profile PATCH first, host-only timezone
  cookie POST second, and reload only after both responses confirm the requested
  state. A failed or malformed response shows localized feedback and does not
  reload.
- Added matching English and Simplified Chinese catalog entries and structural
  parity coverage.

## TDD evidence

Initial RED:

```text
npx vitest run tests/time-zone-personal-settings.test.tsx tests/settings-localization.test.ts
```

- Personal timezone suite failed because
  `components/settings/time-zone-preference.tsx` did not exist.
- Existing localization baseline passed.

GREEN:

```text
npx vitest run tests/time-zone-personal-settings.test.tsx tests/settings-localization.test.ts
```

- PASS: 2 files, 19 tests.

## Final verification

```text
npx vitest run tests/time-zone-*.test.ts tests/time-zone-*.test.tsx tests/settings-localization.test.ts tests/fund-identity-onboarding-ui.test.ts tests/onboarding-setup-localization.test.ts
```

- PASS: 10 files, 112 tests.

```text
npx eslint app/api/settings/personal/route.ts 'app/(app)/settings/personal/page.tsx' components/settings/time-zone-preference.tsx tests/time-zone-personal-settings.test.tsx tests/settings-localization.test.ts
npx openspec validate add-user-timezone-preferences --strict
git diff --check
```

- PASS: changed-file ESLint.
- PASS: strict OpenSpec validation.
- PASS: whitespace check and message catalog JSON parsing.

```text
npx tsc --noEmit
```

- BLOCKED by unrelated existing
  `tests/platform-landing-logo-assets.test.ts:39` TS2802
  iterator/target error. No Task 5 TypeScript error was reported.

HarnessKit `verify-fast.sh` stops before project checks because existing state
assigns unsupported status `complete` to `feed-discovery`.

## Review

- Required independent code/security/accessibility review completed.
- No blocker, high, or medium findings.
- Scoped secret-pattern scan found no findings; no dependency or lockfile
  changes were made.

## Changed files

- `app/api/settings/personal/route.ts`
- `app/(app)/settings/personal/page.tsx`
- `components/settings/time-zone-preference.tsx`
- `messages/en.json`
- `messages/zh-CN.json`
- `tests/time-zone-personal-settings.test.tsx`
- `tests/settings-localization.test.ts`

## Concerns / follow-up

- Real-browser acceptance, tenant-host cookie isolation, production build, and
  repository-wide verification remain assigned to Task 6.
- The profile is intentionally persisted before current-device cookie sync. If
  cookie synchronization fails, the UI reports failure without reloading; the
  existing bootstrap will reconcile the persisted profile on a subsequent
  load.

## Post-review reconciliation

Review identified that the original bootstrap returned immediately for a
manual cookie, so it could not actually fulfill the reconciliation claim above
after a partial write. This was fixed in `30a1d952`
(`fix: reconcile timezone partial writes`).

### Resolution

- `GET /api/time-zone` now returns an explicit `authenticated` boolean with the
  nullable manual preference. Authentication provider/storage failures remain
  sanitized 500 responses.
- Bootstrap now checks authenticated profile state even when the rendered
  cookie is manual. A changed account-wide manual preference replaces a stale
  manual cookie; an authenticated null preference restores Automatic using the
  validated detected zone.
- Signed-out browsers retain an existing manual cookie because null without an
  authenticated account is not evidence that the preference was cleared.
- A matching authenticated manual preference performs only the GET lookup: no
  browser detection, cookie POST, or reload.
- Added successful `fullName` and `mailboxLocalPart` PATCH regression tests
  through the exact-one-mutation discriminator.
- OpenSpec tasks 4.1–4.4 were checked only after the complete covering suite
  passed.

### Reconciliation TDD evidence

RED:

```text
npx vitest run tests/time-zone-route.test.ts tests/time-zone-bootstrap.test.tsx tests/time-zone-personal-settings.test.tsx
```

- FAIL: 2 files, 8 tests; the route omitted authentication state and bootstrap
  skipped all manual-cookie reconciliation cases.
- PASS: the personal suite, including the new legacy name/mailbox regressions.

Focused GREEN:

```text
npx vitest run tests/time-zone-route.test.ts tests/time-zone-bootstrap.test.tsx tests/time-zone-personal-settings.test.tsx
```

- PASS: 3 files, 61 tests.

Complete covering GREEN:

```text
npx vitest run tests/time-zone-*.test.ts tests/time-zone-*.test.tsx tests/settings-localization.test.ts tests/fund-identity-onboarding-ui.test.ts tests/onboarding-setup-localization.test.ts
```

- PASS: 10 files, 117 tests.

Static/spec evidence:

- PASS: changed-file ESLint for route, bootstrap, personal API/UI, and tests.
- PASS: `npx openspec validate add-user-timezone-preferences --strict`.
- PASS: `git diff --check`.
- `npx tsc --noEmit` remains blocked only by the unrelated existing
  `tests/platform-landing-logo-assets.test.ts:39` TS2802 error.

Independent re-review was clean with no blocker, high, medium, or minor
findings. The earlier partial-write concern and both minor review findings are
resolved.
