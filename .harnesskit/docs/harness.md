# HarnessKit Framework

This project uses HarnessKit as a closed-loop workflow harness around Codex work.

## Layers

- Rules: `AGENTS.md`
- Startup: `.harnesskit/scripts/init.sh`
- State: `.harnesskit/state/feature_list.json`
- Handoff: `.harnesskit/state/progress.md`
- Feature plan: `.harnesskit/rules/feature-plan.md`
- Routing: `.harnesskit/rules/skills.md`
- MCP startup policy: `.harnesskit/rules/mcp.md`
- Workflow policy: `.harnesskit/rules/workflow.md`
- Verification policy: `.harnesskit/rules/verification.md`
- Browser policy: `.harnesskit/rules/browser.md`
- Spec: `openspec/changes/<change>/` (project-owned OpenSpec for active feature scope)
- Verification: `.harnesskit/scripts/verify.sh`, `.harnesskit/scripts/qa.sh`, and gstack reviews
- Multi-agent roles: `.harnesskit/codex/agents/`

## Core Rules

- Intake Triage Gate comes before implementation.
- Feature plan comes before feature-like implementation.
- Simple localized bug fixes may use Bugfix Lane.
- Spec defines scope when risk, complexity, or policy requires it.
- Architecture path defines implementation.
- Agents split context and bounded work.
- gstack standardizes review, QA, security, planning, and shipping workflows.
- Verification is tiered by risk.
- Completion requires evidence.

## Feature Planning Flow

Use Intake Triage Gate as the default entrypoint for implementation.
Feature-like, multi-part, risky, or contract-changing work then uses
`.harnesskit/rules/feature-plan.md`. Single-feature work is the lightweight planning case.
Multi-feature work can run in parallel only after contracts, ownership,
dependencies, and merge order are clear.

## Bugfix Lane

Simple localized bug fixes may skip Feature Planning Gate after Intake Triage.
Use this lane only when the fix is local, acceptance is clear, public contracts
do not change, no new capability is added, and security/data/concurrency are not
touched. Reproduce or identify the failing signal, state root cause, make the
smallest fix, and run targeted verification.

## Feature Done Gate

Before a feature is marked ready to merge, check acceptance, allowed change
scope, shared contract changes, verification evidence, required review, and
worker handoff.

## Merge Gate

The main agent merges feature worktrees one by one. Before merge, verify the
feature worktree is clean, the branch has commits, Feature Done Gate evidence is
present, the diff was reviewed, and feature verification passed. After merge,
run post-merge verification before the next feature merge.

## Standard Loop

1. Start: read rules, run init, inspect state and handoff.
2. Triage: choose Feature Planning Gate, Bugfix Lane, Minimal Lane, or main-agent-only.
3. Plan: update `.harnesskit/rules/feature-plan.md` for feature-like single-feature or multi-feature work.
4. Classify: choose `single-feature`, `parallel-safe`, `parallel-with-contract`, `serial-required`, or `main-agent-only`.
5. Contract: define shared interfaces, schemas, routes, CLI outputs, file formats, and permissions before parallel work.
6. Spec: use root OpenSpec artifacts for active feature scope.
7. Route: choose required gstack checks, agents, worktrees, and merge order.
8. Apply: implement the selected lane; use TDD only when risk routing calls for it.
9. Done: apply Feature Done Gate before marking work ready to merge.
10. Verify: use risk-based verification, contract checks, deterministic scripts, and required gstack checks.
11. Integrate: apply Merge Gate, merge feature worktrees one by one, and verify after each merge.
12. Close: update OpenSpec tasks when applicable, feature plan, feature state, and progress handoff.
13. Ship: use gstack ship, land-and-deploy, canary, and document-release when relevant.

## Quality Gates

- No feature is `passing` without evidence.
- Feature plan comes before feature-like implementation, multi-part work, risky bug fixes, refactors, benchmarks, user-visible changes, and contract-changing behavior work.
- Simple localized bug fixes may skip Feature Planning Gate when Bugfix Lane criteria are met.
- Contract-first and risk-based verification is the default; TDD is used for complex algorithms, state machines, regressions, and high-risk paths.
- Passing demo output is not completion unless behavior flows through the intended architecture path.
- UI changes require browser QA.
- Security-sensitive changes require security review.
- Scope changes update the feature plan and root OpenSpec before implementation continues.
- The harness favors reusable mechanisms over incident-specific patches; bug fixes should address the failed contract, boundary, or abstraction.
- Main-goal failures must be investigated directly; smaller smoke, pilot, or subset runs are diagnostic only unless requested.

## Recommended gstack Roles

- `/office-hours`: product idea quality.
- `/plan-ceo-review`: strategy and scope.
- `/plan-eng-review`: architecture and execution.
- `/plan-design-review`: product/design quality.
- `/plan-devex-review`: API, CLI, SDK, onboarding quality.
- `/qa`: browser QA and fixes.
- `/review`: pre-landing code review.
- `/cso`: security audit.
- `/ship`: prepare PR or release.
- `/land-and-deploy`: merge, deploy, and verify.
- `/canary`: post-deploy monitoring.
- `/document-release`: release documentation.

## Multi-Agent Policy

Use agents for context isolation and independent checks, not for vague delegation.
Assign ownership clearly. For code edits, use disjoint write scopes.

## Routing Policy

Keep hard routing in `AGENTS.md`, detailed routing in `.harnesskit/rules/skills.md`,
and executable checks in scripts. Skills are loaded on demand, so critical
workflow rules must be referenced from `AGENTS.md`.

## MCP Startup Policy

Start only MCP servers listed in `.harnesskit/rules/mcp.md`; corresponding sections
should appear in `.codex/config.toml`.
