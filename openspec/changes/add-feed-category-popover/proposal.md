## Why

Following a source currently reserves a permanent topic input on the discovery page, even though categorization is only needed at the moment the user follows that source. Moving category selection into an anchored menu keeps discovery focused while making existing and new categories easier to choose.

## What Changes

- Replace the permanent optional topic field on Follow sources with an anchored category menu opened from each Follow action.
- Let users follow into Uncategorized, choose an existing Miniflux category, or create a category inline before following.
- Keep pending and failure feedback inside the menu, and support keyboard dismissal and responsive positioning.
- Preserve the existing authenticated subscription endpoint and Miniflux-owned category model.

## Capabilities

### New Capabilities

- `feed-category-selection`: Category selection and inline category creation during the personal source-follow workflow.

### Modified Capabilities

None.

## Impact

- Follow sources UI and its localized English/Simplified Chinese copy.
- The feed source catalog projection may expose the already-fetched Miniflux categories for menu rendering; the subscription mutation contract remains compatible.
- Focused feed UI/service tests and real desktop/mobile browser verification.
