# Workflow Policy

Use this file before implementation, debugging, benchmark, or behavior-change work.

## Intake Triage Gate

Run this quick gate before code edits. Target 30-90 seconds for clear tasks.

- Feature Planning Gate is required for feature-like, multi-part, risky, or contract-changing work.
- Simple localized bug fixes may skip Feature Planning Gate and use Bugfix Lane.
- Docs, comments, formatting, and tiny local chores may use Minimal Lane.
- The task label is not authoritative; classify by blast radius, contract impact, and verification risk.
- If classification is unclear, choose Feature Planning Gate.

## Feature Planning Gate

Feature plan comes before feature-like implementation.

- Read or create `.harnesskit/rules/feature-plan.md`.
- Split the request into one or more features.
- Define each feature's goal, acceptance, risk, expected ownership, and verification strategy.
- Classify each feature as `single-feature`, `parallel-safe`, `parallel-with-contract`, `serial-required`, or `main-agent-only`.
- Define merge order before creating feature worktrees.
- Do not assign feature workers before this gate is satisfied.

## Bugfix Lane

Use this lane only for simple localized bug fixes:

- Reproduce the failure or identify the failing signal.
- Find and state the root cause.
- Make the smallest fix that repairs the failed contract, boundary, or behavior.
- Run targeted verification that proves the fix.
- Add a regression test when useful or risk-triggered.
- Report root cause, changed files, verification, and any reason Feature Planning Gate was skipped.

Escalate to Feature Planning Gate if the fix changes public contracts, adds capability, crosses modules, needs worktrees or multiple agents, touches security/data/concurrency, or reveals unclear acceptance.

## Minimal Lane

Use this lane only for docs, comments, formatting, metadata, and tiny local chores:

- State why no feature plan is needed.
- Make the smallest local edit.
- Run syntax or targeted checks when applicable.
- Do not assign feature workers.

## Spec Gate

For feature, bug fix, refactor, behavior, benchmark, or user-visible work:

- Decide whether OpenSpec is required by risk, complexity, user-visible behavior, unclear acceptance, or project policy.
- If OpenSpec is required, an active change exists under root `openspec/changes/<change>/`.
- If OpenSpec is required, `proposal.md`, `design.md`, and `tasks.md` exist for the active change.
- If OpenSpec is required, exactly one OpenSpec task is selected for the current edit.
- If required OpenSpec items are missing, stop and create or update OpenSpec first.
- TDD is optional and risk-triggered; it is not the default implementation gate.

## Architecture Path Gate

- Name the intended architecture path before implementation.
- Do not let feature-specific code bypass the target architecture.
- Passing demo output is diagnostic only unless the behavior flows through the intended architecture path.

## Contract Gate

- Define shared interfaces, schemas, routes, CLI contracts, file formats, and permission boundaries before parallel work.
- Use contract tests first for stable boundaries.
- Workers may not change shared contracts unless the feature plan grants that ownership.
- `parallel-with-contract` features wait until the main agent lands or documents the shared contract.

## Parallel Execution Gate

- `single-feature`: main agent may implement directly or create one worktree.
- `parallel-safe`: create one worktree and one feature-worker per feature.
- `parallel-with-contract`: define contract first, then create feature worktrees.
- `serial-required`: implement or merge in dependency order.
- `main-agent-only`: keep with main agent; do not delegate.
- Main agent owns review, conflict resolution, merge order, and final verification.
- Merge feature worktrees back one by one.

## Feature Done Gate

Use this gate before a feature is marked `ready_to_merge`.

- Acceptance matched against the Feature Requirement Contract.
- Changed files are within Allowed Change Scope, or the exception is explained.
- Shared Contract Changes match the Feature Plan and OpenSpec when required.
- Targeted verification passed, or the verification gap is recorded as a risk.
- Required reviewer, security-reviewer, docs-researcher, and browser/QA reviews are complete or marked not applicable with reasons.
- Worker handoff includes commit SHA, changed files, tests run, risks, and merge readiness.

## Merge Gate

Main agent owns this gate. Feature workers do not merge back to the base branch.

- Feature worktree is clean.
- Feature branch has commits beyond the base branch.
- Feature Done Gate evidence exists.
- Main agent reviewed the feature diff.
- Feature verification passed before merge.
- Merge happens one feature at a time.
- Post-merge verification passed before the next merge.
- Feature Plan, OpenSpec task when required, `.harnesskit/state/feature_list.json`, and `.harnesskit/state/progress.md` are updated.

## Main Goal Discipline

- State the main goal and success standard before substituting any smaller run, benchmark subset, smoke test, or diagnostic path.
- Treat smoke tests, pilot runs, subsets, and synthetic checks as diagnostic only unless the user explicitly requested that smaller target.
- If the main goal stalls or fails, investigate that failure directly. Do not report a smaller success as completion of the larger request.

## Design-First Debugging

- Do not use fallback behavior, hardcoded checks, or temporary patches to hide a failure.
- Diagnose the real boundary first: protocol, data model, runtime, configuration, tool contract, external service, or ownership.
- Fix from the global design level so the system semantics become clearer.
- Fallbacks must be semantically valid states, such as clarification, blocked, partial, or retryable.

## Execution Loop

1. Run Intake Triage Gate and choose Feature Planning Gate, Bugfix Lane, Minimal Lane, or main-agent-only.
2. For feature-like work, update the feature plan with inventory, class, owner, worktree, and merge order.
3. Name the main goal, success standard, architecture path, and contract boundaries.
4. Choose required gstack checks, agent roles, and verification tier.
5. Create feature worktrees only for planned parallel or isolated work.
6. Implement the selected lane with contract/risk verification; use TDD only when risk routing calls for it.
7. Apply Feature Done Gate before marking work ready to merge.
8. Apply Merge Gate and merge completed feature worktrees one by one.
9. Update OpenSpec tasks when applicable, `.harnesskit/state/feature_list.json`, `.harnesskit/rules/feature-plan.md`, and `.harnesskit/state/progress.md` with evidence.
