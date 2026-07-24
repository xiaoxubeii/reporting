## Context

Follow sources currently keeps one page-level `topic` string and renders it as a permanent optional field. Every source row reuses that value when calling the existing subscription route. Miniflux remains authoritative for both feeds and categories: the feed service already lists categories, reuses names case-insensitively, creates a category when needed, and accepts `null` for uncategorized follows.

The change overlaps the in-progress UI localization work, so new copy must be added to both catalogs without changing route, access, or Miniflux ownership semantics.

## Goals / Non-Goals

**Goals:**

- Open an accessible, anchored category popover from each available Follow action.
- Offer Uncategorized, all existing Miniflux categories, and inline creation of one new category.
- Submit the chosen category for the exact source row, prevent duplicate submissions, and keep mutation errors in the open menu.
- Fit the menu within desktop and mobile viewports and preserve keyboard focus/dismissal behavior.

**Non-Goals:**

- Adding a Reporting category table, category-management page, drag-and-drop organization, or category renaming/deletion.
- Changing curated Explore follow behavior.
- Changing the subscription mutation request field (`topic`) or Miniflux category matching rules.

## Decisions

### Use the existing Radix Popover primitive

Each unfollowed source renders a controlled `Popover` whose trigger is the existing Follow button. `PopoverContent` is aligned to the trigger, collision-aware through Radix, limited to the viewport width, and dismissible with outside interaction or Escape. This preserves source-row context better than a modal and gives keyboard focus management without a new dependency.

Alternative considered: a page-level dialog. It was rejected because choosing a category is a small contextual action and a modal would interrupt discovery.

### Make category choice the mutation confirmation

Selecting Uncategorized or an existing category immediately calls the current follow mutation. New category expands an inline form and requires an explicit create-and-follow confirmation. The popover closes only after a successful request; an error remains visible beside the choices so the user can retry without losing context.

Alternative considered: selecting a category and then pressing a second Follow button. It adds an unnecessary confirmation step for existing categories.

### Pass category per action rather than retain page state

The follow handler receives the selected category as an argument and returns success/failure to the popover. There is no shared `topic` state, so category selection cannot leak from one source row to another. Immutable `Set` and object copies continue to update pending and error state.

### Project all Miniflux categories alongside display topics

`listSources` already fetches all categories. It will add a lightweight `categories` projection for selection while retaining the existing `topics` projection, which intentionally contains only non-empty categories for discovery cards. This is an additive response field and requires no new route or data store.

Alternative considered: reuse `topics`. That would hide valid empty Miniflux categories from the selection menu.

### Keep category creation inside the existing follow transaction

The UI sends the new category name through the existing `topic` field. The service remains responsible for bounded text cleanup, case-insensitive reuse, Miniflux category creation, and feed creation. The client does not issue a separate category mutation, avoiding orphaned empty categories when follow fails.

### Align the folder picker with the application control system without changing category semantics

The popover retains the supplied reference's useful three-section composition: a trigger-aligned arrow, a category filter, folder rows, and a separated New Folder action. Its surface, border, text, focus, and action colors use the application's semantic theme tokens, while its trigger, field, typography, icons, radius, and elevation use the same compact control scale as adjacent Reporting controls. New Folder reuses the top field for bounded category entry and exposes explicit cancel/create actions in the footer. Uncategorized remains the first folder row so the existing follow contract is not weakened.

Alternative considered: preserve the reference's fixed white surface, large typography, and green outlines exactly. That presentation is oversized beside the surrounding controls and bypasses Reporting's light/dark theme tokens.

## Risks / Trade-offs

- [Many categories make the menu tall] → Use a bounded scroll region while keeping Uncategorized and New category reachable.
- [A follow request fails after category creation] → Keep the existing server behavior and show the retryable error in the open popover; a retry reuses the category case-insensitively.
- [Several row popovers could retain local form state] → Radix closes the previous popover on outside interaction, and local creation state resets when each popover closes.
- [Additive catalog response drifts from clients] → Make the client tolerate a missing `categories` field and cover the projection with a service test.

## Migration Plan

Deploy the additive catalog response and UI together. Existing clients continue using `sources` and `topics`; the subscription endpoint remains backward compatible. Rollback consists of restoring the permanent input and ignoring the additive response field.

## Open Questions

None.
