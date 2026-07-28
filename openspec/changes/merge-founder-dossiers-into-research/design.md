## Context

Founder dossiers are produced by the Research stage, persisted inside `diligence_memo_drafts.research_output`, and consumed by scoring, QA, and memo generation as research evidence. The current top-level Founders tab independently reloads the latest draft and patches the same nested field, despite having no separate data model or workflow lifecycle.

The diligence detail page already has a reusable `Section` pattern and the Research tab already owns the authoritative draft state plus a generic `patchResearch` path. The implementation must preserve unrelated uncommitted diligence work in the current `main` worktree.

## Goals / Non-Goals

**Goals:**

- Align navigation with the real workflow by moving founder dossiers into Research.
- Keep the team module prominent, compact, editable, localized, and accessible.
- Eliminate duplicate draft loading and optimistic state ownership.
- Prevent a Research rerun from silently discarding existing partner-edited founder dossiers.
- Verify the real English and Simplified Chinese browser paths.

**Non-Goals:**

- Create global Person records, cross-deal identity resolution, background checks, reference workflows, or a team relationship graph.
- Add a Founder pipeline stage, worker, API, database table, or migration.
- Move founder evidence into Scoring or Expert Validation.
- Introduce reliable deletion tombstones or field-level AI-versus-human provenance.

## Decisions

### Keep founder dossiers inside the Research state boundary

`ResearchTab` will render a `FounderTeamSection` after Competitive Landscape and pass the existing `research`, `draftId`, `editable`, and `patchResearch` state boundary. The separate `FoundersTab` wrapper and its duplicate GET/PATCH state will be removed.

Alternative considered: keep a top-level Founder tab. Rejected because it has no independent lifecycle and leaves eight peer tabs for a single-project workspace.

### Use a compact summary plus a side sheet for editing

The section will show concise team rows/cards with name, role, background preview, source count, and open-question count. Selecting a dossier opens a right-side sheet that preserves the Research context while exposing the existing editable fields. Empty states use compact vertical spacing and the add action is available only when a Research output exists and the draft is editable.

Alternative considered: retain inline forms. Rejected because long summaries and questions inflate the Research page and weaken scanability.

### Preserve existing dossiers on rerun with a deterministic merge

A pure merge helper will normalize founder names for matching. Existing entries take precedence for editable fields and remain in their existing order; generated sources are deduplicated and appended, and newly generated unmatched founders are appended. This protects partner edits while still admitting newly discovered founders.

Alternative considered: replace the full array with every Research result. Rejected because the current job writes the full Research output and would silently erase manual edits.

### Keep the existing API and persistence contract

Add/edit/remove continues to PATCH `{ research_output: { founder_dossiers } }` through the existing authorized draft endpoint. No public contract or schema change is required.

## Risks / Trade-offs

- **[Risk] Without field-level provenance, generated updates cannot safely refresh a partner-edited dossier.** → Existing values win; only sources and newly discovered people are merged.
- **[Risk] A manually deleted generated founder can reappear after a rerun because there is no tombstone.** → Keep this limitation explicit and avoid adding a migration solely for deletion provenance in this UI-focused change.
- **[Risk] Adding a fourth Research section lengthens the page.** → Use compact cards and a side sheet so details do not expand inline.
- **[Risk] The current worktree contains overlapping uncommitted diligence changes.** → Apply narrow patches, inspect the final diff, and avoid replacing whole files.

## Migration Plan

1. Add focused behavior tests for navigation, Research placement, no-research state, and rerun merge semantics.
2. Move the UI module and update localized copy without changing stored data.
3. Add the merge helper to the Research stage persistence path.
4. Run fast, targeted, and browser verification in English and Simplified Chinese.
5. Rollback is a code revert; no data migration is involved.

## Open Questions

None for this change. A future Person-profile capability should be proposed only when founder records need cross-project identity, relationship history, or independent workflows.
