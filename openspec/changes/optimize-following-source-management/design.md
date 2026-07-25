## Context

`/feeds/sources` already separates curated discovery and personal management with a URL-backed `view` parameter, but both views still share one discovery form and the Following rendering retains the older source-card/endpoints-card hierarchy. The personal catalog may contain multiple feed endpoints for one publication, so the optimized UI must stay endpoint-safe while avoiding repeated presentation when a source has only one endpoint.

The existing authenticated BFF supports discovery, follow, and unfollow. It does not expose category reassignment or category rename, so the UI must not advertise those actions.

## Goals / Non-Goals

**Goals:**

- Make Following a focused local management view with a compact, scannable category-first layout.
- Preserve every followed endpoint, health signal, personal category assignment, permission check, and recoverable row error.
- Expose existing management actions through an accessible, localized menu.
- Keep Explore website/RSS discovery behavior unchanged.

**Non-Goals:**

- Add category move/rename APIs, new Reporting persistence, bulk operations, or a replacement for Miniflux ownership.
- Change curated catalog layout, subscription mutation contracts, or role permissions.
- Hide degraded/unavailable source health or collapse multiple distinct endpoints into one mutation target.

## Decisions

### Split the view-specific search surfaces

Explore retains the current topic/website/RSS input and discovery submit action. Following renders a search input without a submit action and filters the already loaded personal projection, including source names, descriptions, site URLs, category labels, endpoint titles, and feed URLs. A link back to Explore acts as the add/discover call to action.

This is preferred over one polymorphic form because a URL is a discovery command in Explore but ordinary searchable metadata in Following; sharing the form currently creates ambiguous behavior and stale discovered results.

### Render compact category disclosure groups

Each non-empty Miniflux category renders as a native open `details` group with a focusable `summary`, localized count, and a divided source list. Native disclosure preserves keyboard behavior without adding a dependency. Uncategorized remains last through the existing grouping helper.

### Preserve endpoint identity while reducing repetition

The list renders one compact row per endpoint so every subscription ID remains independently actionable. The publication name is primary. Domain, format, health, and—only when a source has multiple endpoints—a distinct endpoint title become secondary metadata. Raw RSS URLs are available through Copy RSS rather than occupying the default layout.

### Use the existing Popover primitive for actions

A focused client component owns the three-dot trigger and menu. It offers Open source, Copy RSS, and Unfollow using existing URLs and the existing DELETE callback. Clipboard rejection is caught and reported through localized row feedback; successful copy is announced through the page live region.

This is preferred over a new dropdown dependency and over reusing the Following button, which obscures that the control is destructive.

## Risks / Trade-offs

- [One source can expose multiple endpoints] -> Render all endpoints and bind actions to each endpoint subscription ID.
- [Clipboard access can be unavailable] -> Catch the rejected promise, keep the menu recoverable, and display a localized row error.
- [Native disclosure state is not URL-persisted] -> Default every group open; collapse is a temporary presentation preference only.
- [Shared query state survives tab switches] -> Give each view explicit rendering semantics and never render discovery results in Following.
- [Unfollow remains immediate] -> Keep the existing mutation semantics and clearly style the menu item as destructive; confirmation or undo is a separate product decision.
