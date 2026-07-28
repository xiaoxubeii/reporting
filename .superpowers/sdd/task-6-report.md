# Task 6 Report: Timezone acceptance and final scoped verification

## Status

Implemented and verified with repository-baseline concerns recorded.

## Completed

- Audited all 218 hydrated client modules and routed every date-presentation
  bypass through the request-scoped next-intl formatter. The only allowed
  native DateTimeFormat calls are two explicitly classified browser-IANA
  detection calls.
- Added a conservative full-client scanner plus explicit instant and business
  calendar UTC classifications, preventing another handpicked-file false
  completeness claim.
- Verified Automatic Asia/Shanghai, manual UTC, reset-to-Automatic, reload
  persistence, and tenant-host cookie isolation through the real app.
- Reviewed route validation, cookie scope, authentication, migration safety,
  and timestamp immutability; no blocker/high issue remains in the scoped diff.
- Captured browser screenshots under the allowed HarnessKit evidence path.

## Final scoped checks

```text
npx vitest run tests/time-zone-hydrated-formatters.test.ts
```

PASS: 1 file, 16 tests. A covering provider/bootstrap/settings run passes four
files and 50 tests.

```text
npx eslint <all changed TypeScript/TSX files>
npx openspec validate add-user-timezone-preferences --strict
git diff --check
```

PASS: all scoped checks.

The complete timezone reconciliation suite previously passed 10 files and 117
tests. Database reset also passed with the final migration sequence.

Final critical-fix evidence: both LP Activity absolute-title call sites now use
`format.dateTime` directly; the source contract rejects any remaining
`formatDateTime(` call. Changed-file ESLint, strict OpenSpec, and diff-check
pass. TypeScript reports only the known unrelated platform-landing TS2802
baseline at `tests/platform-landing-logo-assets.test.ts:39`, with no LP Activity
diagnostic.

## Browser evidence

- Automatic `Asia/Shanghai`: boundary timestamp rendered July 26.
- Manual `UTC`: boundary timestamp rendered July 25 before and after reload.
- Automatic reset: restored July 26.
- Second tenant hostname: independent cookie and one controlled synchronization
  reload.
- No date/time hydration mismatch or timezone reload loop.

Evidence:

- `.harnesskit/evidence/add-user-timezone-preferences/automatic-asia-shanghai.png`
- `.harnesskit/evidence/add-user-timezone-preferences/boundary-date-asia-shanghai.png`
- `.harnesskit/evidence/add-user-timezone-preferences/browser-assertions.json`

## Concerns

Dedicated screenshots were not captured for manual UTC, reload persistence,
Automatic reset, or sibling-host isolation; the machine-readable evidence marks
that limitation instead of implying otherwise. Repository-wide TypeScript,
HarnessKit, production-build, dependency-audit, and
the existing `next-themes` root-class hydration warning remain baseline
blockers. They are documented in the OpenSpec verification report and were not
expanded into unrelated changes. OpenSpec items 5.3 and 5.4 therefore remain
open; timezone/date behavior itself is verified.
