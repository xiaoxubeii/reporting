# Verification Policy

Use this file before claiming work is complete, fixed, passing, ready, or implemented.

## Required Verification

- Run `./.harnesskit/scripts/verify.sh` before marking work complete. It runs fast and targeted tiers by default.
- Run `./.harnesskit/scripts/verify-fast.sh` after every change.
- Run `./.harnesskit/scripts/verify-targeted.sh` for the active task's language/runtime checks.
- Run `HARNESS_VERIFY_FULL=1 ./.harnesskit/scripts/verify.sh` or `./.harnesskit/scripts/verify-full.sh` before release/merge, or when risk routing requires slow tests.
- After implementing a feature, run the real user path end to end.
- For CLI/TUI changes, start the actual entrypoint, type the real command/input, and inspect the real output.
- For browser-visible changes, read `.harnesskit/rules/browser.md` and run the real page or app workflow.

## Verification Tiers

- Fast: harness state, JSON/schema checks, active OpenSpec, bootstrap marker guard, shell syntax, and cheap project syntax checks.
- Targeted: language/runtime checks for the active task, such as typecheck, lint, focused tests, Go/Rust/Python test commands.
- Full: slow tests, production build, E2E, browser automation, release/merge verification.

Full E2E is required only when the task is browser-visible, cross-boundary, release/merge-bound, or risk routing says it is required. Otherwise mark it `Not run` with reason and replacement evidence.

## Evidence Quality

- Unit tests prevent regressions, but they do not replace end-to-end verification for user-visible behavior.
- `./.harnesskit/scripts/verify.sh` passing does not prove a live model, browser, CLI/TUI, benchmark, or external integration path completed.
- Diagnostic only checks may support investigation but do not close the main goal.

## Final Report Labels

- Completed: evidence proves the requested outcome.
- Attempted but failed: implementation ran, but verification failed.
- Diagnostic only: narrower check or reproduction, not completion.
- Not run: include the reason.

## Required Final Evidence

- OpenSpec: active change and task, or not-applicable reason.
- Architecture path: intended path and evidence it was used.
- Verification tier: fast, targeted, and full status. If full is not run, include reason.
- Tests: commands run and result.
- gstack: required checks run, or not-applicable reason.
- Agents: roles used, or not-applicable reason.
- User path: real CLI/TUI/browser/API workflow run, or not-run reason.
- Bootstrap: no `BOOTSTRAP_ONLY`, `NOT_ARCHITECTURE_COMPLIANT`, or `TEMP_ADAPTER` code remains, or mark the work not complete.
