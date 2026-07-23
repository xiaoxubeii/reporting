<!-- BEGIN HARNESSKIT -->
# reporting Agent Guide

## HarnessKit Precedence

This file contains the HarnessKit entrypoint. The full workflow contract lives under `.harnesskit/`.
Project-owned OpenSpec lives under root `openspec/`; concrete changes live under `openspec/changes/`.

Read these files before work that touches their scope:

- `.harnesskit/rules/workflow.md` — intake triage, planning gate, worktree split, done gate, merge gate.
- `.harnesskit/rules/feature-plan.md` — feature planning, OpenSpec decision, allowed scope, worker handoff.
- `.harnesskit/rules/verification.md` — verification tiers and completion evidence.
- `.harnesskit/rules/browser.md` — browser-visible verification policy.
- `.harnesskit/rules/skills.md` — skill and agent routing.
- `.harnesskit/rules/mcp.md` — MCP startup and change policy.

Local HarnessKit rules override generic ECC/TDD defaults inside this repository.

## Required Reading

- Read `.harnesskit/rules/workflow.md` before complex implementation.
- Read `.harnesskit/rules/verification.md` before claiming completion.
- Read `.harnesskit/rules/feature-plan.md` before feature-like, multi-part, risky, or contract-changing work.
- UI or browser-visible changes must read `.harnesskit/rules/browser.md`.
- Read `.harnesskit/rules/mcp.md` before adding, removing, or changing MCP servers.

## Default Policy

- Main driver: planning-first and verification-first.
- TDD is optional, not mandatory.
- Use test-first only when it is the fastest reliable path for code behavior changes.
- Do not force RED/GREEN/80% coverage gates for research, data, documentation, manuscript, analysis, UI exploration, pitch-deck, or narrow operational tasks.

## Safety

- Preserve user changes outside HarnessKit managed blocks.
- Do not alter unrelated files.
- Do not introduce secrets.
<!-- END HARNESSKIT -->
