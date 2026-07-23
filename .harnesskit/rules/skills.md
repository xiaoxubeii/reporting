# Skill and Tool Routing

Use the smallest skill set that fits the task. Do not load broad skills when a narrower skill applies.

## Hard Order

1. Intake Triage Gate.
2. Feature Planning Gate, Bugfix Lane, Minimal Lane, or main-agent-only decision.
3. Architecture and contract declaration.
4. Parallelization and agent routing decision when feature planning is selected.
5. Contract/risk verification strategy.
6. Implementation in current checkout or feature worktrees.
7. Verification, gstack review, and agent review.
8. Feature state and progress handoff.

Do not assign feature workers before the Feature Planning Gate is satisfied. Simple localized bug fixes may use Bugfix Lane after Intake Triage when they do not change public contracts, add capability, cross module boundaries, require worktrees, or touch security/data/concurrency. Contract tests and risk-based verification prove acceptance for a planned feature; they do not define the task scope.
Passing demo output is not completion unless behavior flows through the intended architecture path.

## Mandatory Routing

- New feature, refactor, benchmark, user-visible workflow, behavior change, risky bug fix, or multi-part work:
  - Run Intake Triage Gate first.
  - Update `.harnesskit/rules/feature-plan.md` when Feature Planning Gate is selected.
  - Classify the feature as `single-feature`, `parallel-safe`, `parallel-with-contract`, `serial-required`, or `main-agent-only`.
  - Use `openspec-explore` if intent or scope is unclear.
  - Use `openspec-propose` before implementation for non-trivial changes.
  - Use `openspec-apply-change` during implementation.
  - Use contract tests first for APIs, CLI output, schemas, generated files, permissions, and shared boundaries.
  - Use TDD only when the verification strategy calls for it.
- Simple localized bug fix:
  - Use Bugfix Lane after Intake Triage.
  - Reproduce or identify the failing signal.
  - State root cause.
  - Use targeted verification.
  - Escalate to Feature Planning Gate if the fix changes contracts, adds capability, crosses modules, or touches security/data/concurrency.

- Security-sensitive work:
  - Use `security-review`.
  - Use gstack `/cso` before marking complete.

- Frontend UI or browser-visible behavior:
  - Use `frontend-design` for UI, visual, and product interface design.
  - Use `ui-ux-pro-max` for frontend quality review, accessibility, usability, responsive behavior, and design-system checks.
  - Use `design-taste-frontend` only for high-taste landing pages, brand pages, portfolios, and deliberately memorable marketing surfaces.
  - Use `frontend-patterns` only as an implementation consistency supplement when the project has established frontend conventions.
  - Use `webapp-testing` or gstack `/qa` before marking complete.

- Completion or handoff:
  - Use `verification-before-completion` before final status.
  - Use `verification-loop` when deterministic check orchestration is useful.
  - Use `careful` or `guard` for dangerous commands or strict edit boundaries.

## Generalization-First Development

- Do not solve bugs by hardcoding the observed sample.
- Fix the mechanism, contract, boundary, or abstraction.
- Fallbacks must be semantically valid.
- Do not use feature-specific shortcuts.

## Architecture Path First

Feature behavior must be produced through the intended architecture path, not through feature-specific shortcuts.

- Define the target path before implementation.
- Keep generic layers generic.
- Tool execution must follow the architecture contract, such as model-returned `tool_calls`, instead of hardcoded feature routing.
- Tests must verify the path, not only the output.

## Bootstrap Exceptions

Temporary bootstrap code is allowed only when the OpenSpec task explicitly says it is not complete architecture.

- Label it `BOOTSTRAP_ONLY` or `NOT_ARCHITECTURE_COMPLIANT`.
- Add an OpenSpec removal task.
- Do not mark the feature `passing` while bootstrap code remains.

## gstack Routing

Choose required gstack checks before implementation. Report each required check as done or not applicable before completion.

- Product idea quality: `/office-hours`
- Plan review: `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/plan-devex-review`
- Browser QA: `/qa`
- Diff review: `/review`
- Security audit: `/cso`
- Ship or create PR: `/ship`
- Merge, deploy, and verify: `/land-and-deploy`

## Agent Routing

Use multi-agent only when work can be split cleanly.

- `explorer`: read-only codebase discovery, no edits.
- `docs-researcher`: official docs, APIs, release notes.
- `worker`: bounded implementation task with explicit file/module ownership.
- `feature-worker`: one-feature implementation in a dedicated git worktree.
- `reviewer`: correctness, regression, maintainability review.
- `security-reviewer`: auth, secrets, permissions, injection, data leakage.

For code edits, use reviewer before completion. For multi-feature implementation, use one feature-worker per feature and one git worktree per feature. Main agent owns integration, conflict resolution, and final decision.

Rules:

- Do not assign the immediate blocking task to a sub-agent.
- Do not let multiple agents edit the same files.
- Main agent owns integration.
- Feature agents must commit on `feature/<feature-id>` and must not merge back to the base branch.
- Every worker must state changed files.
- Self-check must compare acceptance, allowed change scope, shared contract changes, and verification plan before review.
- Worker handoff must include feature id, branch/worktree, commit SHA, changed files, tests run, risks, merge readiness, and self-check result.
- Reviewers must lead with concrete findings and file references.

## Feature Worktree Flow

Use this flow when the user asks for multiple features or parallel feature agents:

1. Create a dedicated worktree: `./.harnesskit/scripts/create-feature-worktree.sh . <feature-id> --agent feature-worker`.
2. Assign exactly one feature agent to that worktree.
3. The feature agent implements, tests, commits, and reports self-check, changed files, tests run, risks, merge readiness, and commit SHA.
4. The main agent applies Feature Done Gate, reviews, runs verification, and merges: `./.harnesskit/scripts/merge-feature-worktree.sh . <feature-id> --remove-worktree`.
5. If merge fails, keep the worktree and record the blocker in `.harnesskit/state/progress.md`.

## Do Not

- Do not use feature-specific shortcuts.
- Do not mark `.harnesskit/state/feature_list.json` status as `passing` without evidence.
- Do not skip `./.harnesskit/scripts/verify.sh` unless impossible; record why in `.harnesskit/state/progress.md`.
