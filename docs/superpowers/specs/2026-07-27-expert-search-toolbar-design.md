# Expert Search Toolbar Design

## Goal

Give every search and filtering control in Expert Resources one coherent visual system while preserving the existing search behavior, APIs, permissions, and expert lifecycle.

## Scope

The change is limited to `components/experts/expert-directory.tsx` and focused UI tests and translations when needed. It covers:

- live filtering in the Platform Experts and Fund Experts tabs;
- expert discovery query input and source selection;
- candidate-result status filtering;
- responsive, keyboard, loading, empty, and error states.

It does not change discovery adapters, request payloads, matching, persistence, authorization, or result ranking.

## Interaction Design

### Platform Experts and Fund Experts

Each directory tab uses a compact search toolbar. A search icon sits inside the input, the input retains live client-side filtering, and a result count appears alongside it on wider screens. The empty state distinguishes an empty directory from a query with no matches.

### Discover Experts

Discovery uses two visually related but semantically separate rows:

1. The search action row contains the query input, a multi-select source control for PubMed and ClinicalTrials.gov, and the primary Search Experts button.
2. The result toolbar contains the candidate heading and count plus a status Select for Pending, Confirmed, Rejected, and All.

Source selection remains a search parameter. Candidate status remains a result filter. They must not appear as interchangeable filters in one undifferentiated row.

## Visual Contract

- Inputs, Select triggers, and buttons use the existing shared UI primitives.
- Controls share the same height, border radius, border color, text sizing, hover state, disabled state, and keyboard focus ring used by the Opportunities toolbar.
- Search icons are decorative and do not duplicate accessible labels.
- Desktop layouts are horizontal where space permits; narrow layouts wrap with the search input occupying the full available width.
- The current page hierarchy, tabs, cards, notices, and candidate actions remain unchanged.

## Component Boundaries

The existing `ExpertDirectory` remains the state owner. Small local presentation components may be extracted for a search field, discovery-source menu, or result toolbar if that makes the JSX clearer, but no new cross-page abstraction is required for this single consumer.

The source selector exposes the existing immutable source state through checked values and copy-on-write updates. The status Select continues to update `candidateStatus`. The directory search continues to update `directoryQuery`.

## States and Errors

- The discovery button remains disabled for an empty query and while discovery is busy.
- Loading copy remains visible in the primary action.
- Existing API errors, partial-source warnings, and confirmation notices retain their current semantics.
- A zero-result query receives a search-specific empty message; an actually empty expert pool keeps the existing pool-specific empty message.

## Verification

- Focused component or contract tests cover both directory tabs, source selection, status selection, disabled/loading behavior, and distinct empty states.
- TypeScript, changed-file ESLint, localization checks, and `git diff --check` pass.
- The real authenticated `/experts` page is verified in desktop and narrow viewports, including keyboard focus, wrapping, discovery loading, and result filtering.

## Acceptance Criteria

- All Expert Resources search and filtering controls look and behave as one design family.
- Search parameters and result filters remain visually and conceptually distinct.
- Existing search/discovery behavior and server contracts are unchanged.
- No horizontal overflow occurs at the supported narrow viewport.
