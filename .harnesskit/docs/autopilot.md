# HarnessKit Autopilot Design

## Purpose

Every new project starts with one Kickoff. The required user inputs are:

```text
product goal
token budget
```

The first goal establishes the initial product direction. Kickoff turns that
direction into project-specific Harness rules and a concrete goal contract.
When the Kickoff gates pass, Autopilot starts automatically and owns the
complete product outcome. It plans the product, implements it through the
existing HarnessKit workflow, verifies it, deploys it to production, evaluates
it through the real production interface, and improves it until the original
goal is met or the token budget is exhausted.

The user does not participate in intermediate product, engineering, testing,
or release decisions. Autopilot resolves ordinary ambiguity with explicit,
reasonable assumptions and preserves the original goal throughout the run.

Autopilot is accountable for a production product, not a code candidate.

## Execution Contract

### Input

- `goal`: the original product outcome requested by the user. For a new
  project, it also establishes the initial product direction.
- `tokenBudget`: the hard maximum number of model tokens available to the
  complete Kickoff and Autopilot run, including initialization, planning,
  development, QA, operations, production evaluation, reflection, and final
  reporting.

The repository, deployment target, credentials, accounts, domains, and other
required infrastructure must already be available in the pre-authorized
environment. Autopilot uses them when they exist; it does not ask the user to
approve routine intermediate decisions.

## Kickoff and Project Initialization Gate

Autopilot is project-specific. Before the first run, Kickoff must determine and
freeze:

```text
product direction
Completion Protocol
Production Adapter
User Evaluation Boundary
Token Enforcement
initial GoalContract
```

Kickoff uses the original goal, token budget, repository, available production
environment, and existing HarnessKit configuration. Any required discussion or
external setup happens in Kickoff. After Kickoff reaches `ready`, the same
command immediately transitions into Autopilot without another approval.

The four project-level contracts are stored in one project-owned rule file:

```text
.harnesskit/rules/autopilot.md
```

That file freezes the product direction and four contracts:

| Section | Fixed at project initialization |
| --- | --- |
| Product Direction | The target users, core value, product boundary, and the test for whether a later goal remains in scope. |
| Completion Protocol | How a run derives measurable criteria from a goal, which production evidence is mandatory, and what can return `completed`. |
| Production Adapter | The production target and the exact deploy, active-version, health-check, and rollback commands or adapters. Secret references are allowed; secret values are not stored in the rule. |
| User Evaluation Boundary | The production UI or public API that User may access, the required personas and journeys, the evidence format, and the rule that a simulated User is product evaluation rather than proof of market demand. |
| Token Enforcement | The authoritative usage source, hard-stop behavior, safety reserve policy, per-role limits, and final accounting requirements. The numeric budget remains a per-run user input. |

Kickoff must reject missing sections, unresolved placeholders, commands that
cannot be validated, or contradictory completion and release rules. It ends in
exactly one pre-run status:

| Kickoff status | Meaning |
| --- | --- |
| `ready` | Product direction, all four Harness contracts, and the initial `GoalContract` are frozen and Autopilot starts immediately. |
| `kickoff_blocked` | A required project or production condition cannot be established; Autopilot does not start. |

The project lifecycle is:

```text
uninitialized
-> kickoff
-> ready
-> autopilot_running
```

`kickoff_blocked` branches from `kickoff`. A later goal outside the frozen
Product Direction produces the pre-run state `kickoff_required`; no Autopilot
run starts until a new Kickoff versions and validates the direction and rules.
These are project lifecycle states, not Autopilot final statuses.

Because Token Enforcement does not exist before the first Kickoff, HarnessKit
must provide a small, non-editable bootstrap token limiter. Kickoff usage is
charged to the user-supplied budget, cannot exceed that budget, and is handed
to the newly frozen Token Enforcement ledger before Autopilot starts.

The rule file is read-only to every Autopilot role. At run start, the runner
records its content hash in state. A change to the active rule hash stops the
run instead of allowing an Agent to lower completion, deployment, User, or
budget requirements.

Project initialization cannot know the acceptance criteria for every future
goal. During Kickoff, Product Manager applies the frozen Completion Protocol to
the initial goal and produces a concrete `GoalContract` containing the success
criteria, assumptions, and required production evidence. Autopilot records its
hash before implementation. Later roles and iterations may add work, but they
may not weaken the frozen `GoalContract`.

Later goals in the same product direction reuse the four validated Harness
contracts and require only a new goal and token budget. The runner first checks
the goal against the frozen target users, core value, and product boundary.
When it is in scope, Product Manager creates and freezes a new `GoalContract`,
then Autopilot starts. A goal that changes the product direction, production
target, User boundary, or enforcement rules triggers `kickoff_required`
instead of changing those rules during a run. A new Kickoff creates a new
version; it never edits the active version in place.

## Final Status

Every run ends in exactly one status:

| Status | Meaning |
| --- | --- |
| `completed` | The original goal is proven on a healthy production deployment. |
| `budget_exhausted` | The remaining budget, after the required safety reserve, cannot fund another safe step; the best stable production version is preserved if one exists. |
| `blocked` | An indispensable external requirement is unavailable, or the frozen Harness rule integrity is violated. |

A branch, commit, build, passing unit test, preview, or staging deployment is
never sufficient for `completed`. Token exhaustion is a stop condition, not
evidence of goal completion.

## Core Product Loop

Autopilot acts as the responsible product lead and coordinates five bounded
roles:

```text
Product Manager
-> Developer
-> QA
-> Operations
-> User
-> Product Manager
```

The complete startup and product loop is:

```text
new project: goal + token budget
    |
    v
Kickoff: product direction + four Harness contracts + initial GoalContract
    |
    v
rules valid -> Autopilot starts automatically
    |
    v
original goal + remaining token budget
    |
    v
Product Manager: choose and specify the next product increment
    |
    v
Developer: implement the increment through HarnessKit
    |
    v
QA: independently test the fixed release candidate
    |                         |
    | reject                  | pass
    v                         v
Developer or Product Manager  Operations: deploy the same artifact
                              |
                              v
                        production health checks
                              |              |
                              | fail         | healthy
                              v              v
                           rollback        User
                              |              |
                              +------ feedback and evidence
                                             |
                                             v
                                      Product Manager
```

After each healthy production release, User exercises the product through its
real user-facing interface. If the production evidence proves the original
goal and no blocking problem remains, Autopilot finishes with `completed`.
Otherwise Product Manager evaluates the feedback and starts the next increment.

User feedback is evidence, not an automatic requirement. Product Manager may
reject feedback that is not reproducible, is unrelated to the original goal,
or would consume budget without enough expected value.

## Existing HarnessKit Is the Development Inner Loop

Developer must reuse the workflow already defined by HarnessKit:

```text
Intake triage
-> OpenSpec when required
-> feature plan and architecture contract
-> implementation in the current checkout or an isolated worktree
-> tests, review, security checks, and browser verification
-> repair failed checks
-> Feature Done and Merge gates
-> fixed release candidate
```

Autopilot does not duplicate HarnessKit planning, coding, debugging, review,
security, worktree, or merge mechanisms. The top-level product roles operate
around that existing development path.

The HarnessKit candidate is only an input to QA and Operations. It is not the
final product result.

## Role Contracts

### Autopilot

Autopilot receives the frozen Product Direction, original goal, and token
budget. It:

1. Preserves the original goal across every iteration.
2. Converts ordinary ambiguity into explicit, reasonable assumptions.
3. Allocates the shared token budget across roles and iterations.
4. Starts only work that can be completed or safely stopped with the remaining
   budget.
5. Routes structured artifacts between roles.
6. Uses production evidence to decide whether to continue or stop.
7. Returns the production result, evidence, token usage, and remaining risks.

Autopilot does not ask the user to approve intermediate plans, implementation
choices, test repairs, or routine releases.

### Product Manager

Product Manager receives:

- The frozen Product Direction and `GoalContract`.
- The unchanged original goal.
- The current production state.
- QA and User findings from earlier iterations.
- Operations release, health-check, and rollback findings.
- Validated lessons relevant to the product.
- The token budget allocated to the next increment.

Product Manager outputs a `ProductPlan` containing:

- The user or business problem to solve next.
- The smallest valuable increment.
- Measurable acceptance criteria.
- Explicit non-goals and assumptions.
- Expected production evidence.
- Priority, risk, and estimated token cost.

Product Manager may revise the implementation plan or reject low-value
feedback. It must not narrow or replace the original goal to make completion
easier, or use feedback to change the frozen Product Direction.

### Developer

Developer receives a `ProductPlan` authorized by Autopilot, prior failure
evidence, and relevant validated lessons. It runs the existing HarnessKit
development loop and outputs an `ImplementationBundle` containing:

- A fixed candidate commit and build artifact.
- Changed files and product behavior.
- Test, build, review, security, and browser evidence required by HarnessKit.
- Deployment or migration instructions when applicable.
- Known risks.

Developer may not deploy the product or declare the original goal complete.

### QA

QA runs in a fresh context and receives the original goal, `ProductPlan`, and
fixed `ImplementationBundle`. QA independently verifies the applicable unit,
integration, end-to-end, regression, browser, security, data-isolation,
accessibility, and performance behavior.

QA outputs:

```json
{
  "passed": false,
  "gaps": [
    {
      "severity": "blocking",
      "description": "The production-critical user flow fails after sign-in",
      "evidence": "Recorded E2E trace and failed assertion"
    }
  ],
  "evidence": []
}
```

QA must reject when acceptance criteria are unmet, required evidence is
missing, a diagnostic is presented as end-to-end proof, or a blocking
correctness, regression, security, or data issue remains. QA does not edit
product code or weaken acceptance criteria.

### Operations

Operations accepts only the exact artifact that passed QA. It:

1. Uses the project's real deployment path.
2. Records the artifact, commit, version, environment, and production URL.
3. Runs production health checks and smoke tests.
4. Preserves the last-known-good release.
5. Rolls back when deployment or production health checks fail.

Operations outputs a `ReleaseResult` containing the production version and
URL, deployment evidence, health evidence, and rollback result when applicable.
It does not change product requirements or patch code during deployment.

### User

User runs after a healthy production deployment, in a fresh context. It uses
only the real production UI or public API and does not inspect source code or
Developer explanations.

Its access, personas, journeys, and evidence requirements come from the frozen
User Evaluation Boundary created during project initialization.

User exercises typical, edge, and failure paths relevant to the original goal
and deliberately looks for poor usability, incorrect behavior, missing value,
and regressions. It outputs a `UserFeedback` record containing:

- Production version and URL tested.
- User goals and journeys attempted.
- Reproduction steps and evidence.
- Severity and user impact.
- Whether the original product goal is satisfied from the user perspective.
- Remaining problems and suggested improvements.

QA verifies conformance before release; User critiques usefulness and defects
after release. These roles are not interchangeable.

## Token Budget

The project-specific measurement source, reserve policy, and enforcement
behavior come from the frozen Token Enforcement contract. The numeric token
budget supplied for the run is a shared hard limit. No role may increase it or
silently continue beyond it.

Autopilot must:

- Record actual token usage for every role invocation.
- Track `used`, `remaining`, and usage by role and iteration.
- Allocate more tokens to the current blocking path instead of dividing the
  budget equally.
- Reserve enough budget for QA, safe release or rollback, production
  evaluation, state persistence, and the final report.
- Avoid starting a new increment when the remaining budget cannot carry it to
  a safe stopping point.

When the budget can no longer support safe progress, Autopilot stops new work,
abandons or rolls back incomplete release activity, preserves the
last-known-good production version when one exists, and returns
`budget_exhausted`.

## Production Release Requirements

A project's concrete deployment commands and environment come from the frozen
Production Adapter. The following requirements are universal.

A production iteration is eligible for goal acceptance only when:

1. QA passed the exact artifact being released.
2. Operations used the project's intended production deployment path.
3. The deployed version and production URL are recorded.
4. Health checks pass after deployment.
5. The real user-facing interface is reachable.
6. User runs black-box production evaluation against that version.

If release or health verification fails, Operations rolls back to the
last-known-good release when one exists. If this was the first release, it
marks the deployment failed and ensures the unhealthy version is not treated
as active production. The failure becomes evidence for Product Manager and
Developer; it is never reported as a successful release.

## Feedback and Learning

Every non-successful terminal run and every rejected, rolled-back, or visibly
poor iteration produces a structured retrospective:

```text
failure pattern
observed evidence
root cause
proposed reusable rule
role or workflow to which the rule applies
```

A reflection is not automatically a lesson:

```text
poor iteration
-> retrospective
-> candidate lesson
-> apply lesson in a later relevant iteration
-> QA and production evaluation pass without the same failure or a regression
-> validated lesson
```

Only validated lessons are persisted and supplied to future runs. A lesson
that does not prevent the same failure, causes a regression, or lacks evidence
is replaced or discarded.

When evidence shows that HarnessKit itself allowed a repeatable process failure,
Autopilot may schedule a focused HarnessKit improvement through the normal
HarnessKit workflow. A free-form reflection may not directly rewrite the
development process. The improvement remains provisional until a later
relevant cycle proves that it prevents recurrence without regression;
otherwise it is reverted or discarded.

## Persistent State and Resume

Use one state file so an interrupted run can resume:

```json
{
  "projectPhase": "autopilot_running",
  "kickoffStatus": "ready",
  "kickoffVersion": 1,
  "productDirection": "...",
  "originalGoal": "...",
  "goalContractHash": "sha256:...",
  "harnessRuleHash": "sha256:...",
  "tokenBudget": 200000,
  "tokensUsed": 82000,
  "tokenUsage": {
    "byRole": {},
    "byIteration": {},
    "reserved": 12000,
    "remaining": 106000
  },
  "iteration": 3,
  "phase": "user_evaluation",
  "productPlan": {},
  "releaseCandidate": {},
  "qaVerdict": {},
  "production": {
    "current": {},
    "lastKnownGood": {}
  },
  "userFeedback": [],
  "candidateLessons": [],
  "validatedLessons": [],
  "status": "running"
}
```

State transitions must be written before and after externally visible actions.
Deployment and rollback operations must be idempotent or detect the already
deployed version so resume cannot duplicate a dangerous action.

Validated lessons may be stored in one project-level Markdown file. Git remains
the rollback and change-history mechanism for product and HarnessKit edits;
the deployment target remains the source of truth for the active production
version.

## Stop Conditions

### Completed

Autopilot returns `completed` only when:

- The current version is deployed to production and healthy.
- QA passed the exact deployed artifact.
- User completed post-release black-box evaluation.
- Production evidence satisfies the frozen `GoalContract` and proves the
  unchanged original goal.
- No blocking product, correctness, security, data, or release problem remains.

### Budget Exhausted

Autopilot returns `budget_exhausted` when the hard budget cannot support another
safe step after the required reserve. It preserves the best stable production
version if one exists and reports:

- Whether a production version exists and, if so, what is live.
- What was completed.
- What remains incomplete.
- Token usage by role and iteration.
- Validated and candidate lessons.
- Known risks.

It must not report the original goal as completed.

### Blocked

Autopilot returns `blocked` only when completion is impossible inside the
pre-authorized environment, such as a missing required secret, production
account, domain, or unavailable external service with no valid alternative,
or when the frozen Harness rule hash changes during the run.

The blocked result preserves the last-known-good production version if one
exists and names the precise external condition required to continue. Ordinary
product or engineering uncertainty is not a blocker; Autopilot resolves it
within the available budget.

## Minimal Implementation Surface

The first implementation should add only:

```text
.harnesskit/scripts/kickoff.*
.harnesskit/scripts/autopilot.*
.harnesskit/scripts/validate-autopilot.*
.harnesskit/rules/autopilot.md
.harnesskit/codex/agents/autopilot.toml
.harnesskit/codex/agents/product-manager.toml
.harnesskit/codex/agents/qa.toml
.harnesskit/codex/agents/operations.toml
.harnesskit/codex/agents/user.toml
.harnesskit/state/autopilot.json
.harnesskit/state/autopilot-lessons.md
```

Developer reuses the existing HarnessKit agent and workflow configuration. The
runner needs one role adapter and one deployment adapter:

```ts
runRole(role, input, { cwd, readOnly, tokenLimit }): Promise<RoleResult>

deploy(artifact, target): Promise<DeploymentResult>
healthCheck(deployment): Promise<HealthResult>
rollback(lastKnownGood): Promise<RollbackResult>
```

No dashboard, distributed queue, agent voting system, model training pipeline,
or general-purpose multi-agent platform belongs in the first version.

## Acceptance Criteria for the First Version

The first version is complete when:

1. One Kickoff command accepts a product goal and hard token budget, establishes
   the initial product direction, and produces a valid
   `.harnesskit/rules/autopilot.md` containing Product Direction, Completion
   Protocol, Production Adapter, User Evaluation Boundary, and Token
   Enforcement sections with no unresolved placeholders.
2. Kickoff derives and freezes the initial `GoalContract`; when all gates pass,
   the same command automatically starts Autopilot without another approval.
3. A later goal in the same product direction reuses the validated Harness
   rules and creates a new frozen `GoalContract`; a direction or rule change
   produces `kickoff_required` and triggers a new versioned Kickoff.
4. Run state records Kickoff status, product direction, and the Harness rule
   and `GoalContract` hashes; a mid-run rule change stops execution instead of
   silently changing acceptance.
5. Autopilot proceeds without intermediate user approval through Product
   Manager, Developer, QA, Operations, and User.
6. Developer reuses the existing HarnessKit workflow rather than duplicating
   its planning and engineering logic.
7. A QA rejection automatically returns structured evidence to Developer or
   Product Manager for another iteration.
8. Operations can deploy only the exact artifact that passed QA.
9. Operations performs a real production deployment, records its URL and
   version, verifies health, and rolls back a failed release.
10. User evaluates every healthy release through the real production interface
   before the original goal may be declared complete.
11. Product Manager converts relevant User feedback into the next product plan
   and rejects irrelevant or unsupported feedback.
12. The immutable bootstrap limiter constrains Kickoff, actual token usage is
    tracked across Kickoff, every role, and every iteration, and the hard
    budget cannot be exceeded.
13. Budget exhaustion preserves the last-known-good production version when
    one exists and is never reported as success.
14. An interrupted run resumes without repeating a completed deployment or
    rollback.
15. A reusable lesson is persisted only after a later QA and production cycle
    validates it without regression.
16. A `completed` result contains the production version and URL. Every result
    contains available QA and production evidence, token usage, remaining
    risks, and either `completed`, `budget_exhausted`, or `blocked`; a
    non-successful result explicitly reports when no production version exists.

## Non-Goals

- Requiring the user to approve intermediate plans, code, tests, or releases
  after Kickoff.
- Repeating Kickoff for an in-scope goal when the existing project rules remain
  valid.
- Replacing the existing HarnessKit development workflow.
- Building a general-purpose multi-agent platform.
- Training or fine-tuning the underlying model.
- Automatically expanding permissions or security authority.
- Treating unverified reflection as reusable experience.
- Treating a branch, commit, build, preview, or staging environment as the
  final product.
