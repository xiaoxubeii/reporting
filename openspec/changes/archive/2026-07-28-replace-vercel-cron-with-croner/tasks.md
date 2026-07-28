## 1. Scheduler Contract

- [x] 1.1 Add focused tests that freeze the five route/schedule definitions and cover configuration validation, authenticated GET invocation, redirects, non-2xx responses, and request timeout behavior.
- [x] 1.2 Add Croner to the production dependency set and implement the immutable UTC job manifest with bounded per-job timeouts.

## 2. Persistent Runtime

- [x] 2.1 Implement the reusable invocation and runner lifecycle modules with secret-safe structured logging, per-process overlap protection, and tracked AbortControllers.
- [x] 2.2 Implement the production entrypoint with recurring, list, and named one-shot modes plus minimal health/readiness endpoints.
- [x] 2.3 Implement SIGTERM/SIGINT shutdown that stops future schedules, closes health listeners, waits for active work, and aborts work after the configured grace period.

## 3. Production Process Migration

- [x] 3.1 Add separate Web and Cron production commands and document required server-only environment variables, safe HTTP opt-in, one-replica topology, restart supervision, and cutover/rollback order.
- [x] 3.2 Remove the five Vercel recurring declarations while preserving function compatibility metadata and update focused comments that still name Vercel Cron as the active scheduler.

## 4. Verification and Review

- [x] 4.1 Run the actual one-shot entrypoint against a local authenticated probe server and verify method, path, authorization, timeout, exit status, and secret-free logs.
- [x] 4.2 Run focused tests, strict OpenSpec validation, HarnessKit fast/targeted verification, and a production build; record any unrelated repository failures separately.
- [x] 4.3 Complete correctness and security review, resolve all in-scope blocker/high findings, and update HarnessKit/OpenSpec progress evidence.

## Verification Evidence

- Passed 29 focused unit/integration tests, including the real Node.js entrypoint, authenticated local HTTP invocation, resident health checks, malformed request-target recovery, production secret-strength validation, SIGTERM shutdown, timeout behavior, startup rollback, and secret-free logs.
- Passed focused ESLint for all new runtime/test files, `openspec validate replace-vercel-cron-with-croner --strict`, HarnessKit `verify-fast`, schedule listing, syntax/JSON checks, and `git diff --check`.
- The production Web bundle compiled successfully. Full `next build` and HarnessKit targeted verification then stopped at repository-wide pre-existing lint errors in unrelated application files; standalone TypeScript validation likewise reports 46 existing errors and none in the Croner files.
- Production dependency audit reports 19 remaining existing findings (4 moderate, 15 high, 0 critical); the critical transitive `protobufjs` finding was removed by updating it to 7.6.5, and `croner@10.0.1` is not named in the audit report. Remaining suggested fixes include breaking framework upgrades or packages with no available fix.
