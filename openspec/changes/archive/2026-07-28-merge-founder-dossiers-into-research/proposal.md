## Why

The diligence workspace currently presents founder dossiers as a top-level tab even though they are generated, stored, and consumed as part of the Research output. This creates an under-filled page, duplicates draft loading and persistence logic, and gives a supporting evidence artifact the same navigation weight as real workflow surfaces.

## What Changes

- Remove the top-level Founders tab from the diligence workspace.
- Add a compact, editable "Founders & Core Team" section to the Research tab after Competitive Landscape.
- Reuse the Research tab's draft state and `research_output` patch path for add, edit, and remove operations.
- Show an explicit pre-research state instead of exposing an add action that cannot persist.
- Preserve existing founder dossiers when Research is rerun so partner edits are not silently replaced, while admitting newly discovered founders.
- Update English and Simplified Chinese copy and focused UI/contract coverage.

## Capabilities

### New Capabilities
- `diligence-research-team`: Founder and core-team dossiers are managed as a first-class section of the diligence Research workspace, with safe rerun behavior for partner-edited dossiers.

### Modified Capabilities

None.

## Impact

- Diligence detail navigation and Research/Founder UI in `app/(app)/diligence/[id]/deal-detail.tsx`.
- Research result persistence/merge behavior in the memo-agent Research stage.
- English and Simplified Chinese locale catalogs.
- Focused diligence navigation, localization, and Research behavior tests.
- No database migration, new API, new worker, or new pipeline stage.
