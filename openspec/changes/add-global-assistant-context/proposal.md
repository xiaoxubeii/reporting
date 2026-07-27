## Why

Analyst is mounted page by page today, so its availability is inconsistent and users cannot explicitly bring the information they are reading into a conversation. A single application-level assistant with user-controlled page snapshots makes the workflow predictable while preserving the existing server-owned Company, Deal, Fund, LP, Diligence, and Accounting security boundaries.

## What Changes

- Mount one responsive assistant host in the authenticated application shell instead of duplicating it across individual pages: a desktop dock that reflows content, a full-height narrow-screen drawer, and a compact right-edge launcher when closed.
- Add a bounded, typed `AssistantContextSnapshot` contract for plain-text and structured content already visible in the browser.
- Let users drag supported Search, Feed, Expert, Company, and Deal items to a full-height right-edge drop target, with an equivalent “Send to assistant” action for touch, keyboard, and assistive-technology users.
- Show removable context chips in the assistant and keep the selected snapshots with the relevant user message in existing conversation JSON.
- Combine front-end snapshots with the existing server-resolved business scope; snapshots remain untrusted reference material and never grant read or write authority.
- Validate, normalize, deduplicate, and cap snapshot input at the Analyst API boundary before prompt construction.
- Preserve the existing approval and server-authorization paths for any drafted or executed write.

## Capabilities

### New Capabilities

- `global-assistant-context`: A globally available authenticated assistant that accepts bounded front-end page snapshots through accessible drag/drop and explicit add actions, persists their provenance with conversations, and composes them with existing trusted business context.

### Modified Capabilities

None.

## Impact

- Shared Analyst client state, launcher, panel, request contract, prompt construction, and conversation serialization.
- Authenticated application shell and removal of page-local Analyst launcher/panel mounts.
- Search, Feed, Expert, Company, and Deal result/card surfaces.
- English and Simplified Chinese message catalogs and UI-surface inventory.
- Focused unit, API contract, component, accessibility, responsive, and authenticated browser verification.
- No new database table, search index, provider abstraction, external fetcher, or page-specific context API.
