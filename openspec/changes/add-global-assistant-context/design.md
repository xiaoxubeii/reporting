## Context

The authenticated shell already owns one `AnalystProvider`, but pages independently mount `AnalystToggleButton` and `AnalystPanel`. This creates inconsistent availability and duplicates presentation concerns across routes. The Analyst API already combines server-resolved Fund, Company, Deal, Vehicle, LP, and Diligence context and persists conversations as JSON messages; those scopes are authorization-sensitive and must remain server-owned.

Search, Feed, Expert, Company, and Deal components already hold normalized data that is visible to the current user. Re-fetching that content through a resolver per entity would add latency, duplicate adapters, and turn a simple user-provided reference into a new trusted-data layer. The change therefore adds an explicitly untrusted page-snapshot channel rather than replacing existing business context.

The UI direction is restrained and utilitarian. When closed, one compact semantic-theme tab sits on the right edge. During a valid drag, the full right edge becomes an obvious drop target. At 1280px and wider, opening the assistant adds a 400px-default dock beside the application and reflows the main content; the user can resize it from 320px through 560px without reducing the application region below 720px. From 768px through 1279px it uses a full-height 400px drawer, and below 768px it uses a near-full-width drawer. It reuses the current panel and design tokens rather than introducing a new visual system.

## Goals / Non-Goals

**Goals:**

- Make one assistant entry point available throughout the authenticated application.
- Let supported components turn only data they already hold into bounded plain-text snapshots.
- Support pointer drag/drop plus an equivalent button for touch, keyboard, and assistive technology.
- Keep a conversation-level active context tray, preserve per-turn provenance in existing conversation JSON, and restore active context after reopening a thread.
- Compose untrusted snapshots with, but never substitute them for, existing server-resolved business context.
- Keep provider messages standard and keep all write authority in existing server-side tools and approval flows.

**Non-Goals:**

- No DOM or `innerHTML` serialization, arbitrary cross-origin page dragging, URL re-fetching, OCR, PDF extraction changes, or full-page capture.
- No entity resolver framework, search index, context table, or new external dependency.
- No change to existing business-scope authorization, AI provider selection, staged-action approval, or Fund isolation.
- No code-wide Analyst-to-Assistant rename; only user-facing launcher/panel language changes where needed.

## Decisions

### 1. Mount a single responsive host and panel in `AppShell`

`AppShellInner` renders one right-edge launcher and one `AnalystPanel` for authenticated application routes. The existing `hasAIKey` rule remains authoritative, and the full-screen LP preview remains excluded. Page-local launcher and panel mounts are removed, while Company, Deal, Vehicle, LP, and Diligence scope-sync components remain in place.

The desktop host participates in the shell layout rather than using fixed positioning. The shell expands its maximum width from 1280px to 1680px while the dock is open, preserving a 1280px content region on wide displays and naturally shrinking it on narrower desktop viewports. A pointer- and keyboard-operable separator changes the desktop dock width within bounded limits and persists the preference locally. Below 1280px the same panel is rendered through the existing accessible Sheet primitive and overlays the page at full height. Crossing the breakpoint while open restores focus inside the still-open assistant. Closing restores the content width and focus to the edge launcher.

This is preferred to adding the launcher to more pages because a page opt-in model is the cause of the inconsistency. It also guarantees one open state, one conversation state, and one drop target.

### 2. Use a small versioned snapshot contract

The shared contract is a versioned, immutable plain-data object:

```ts
type AssistantContextKind =
  | 'search_result'
  | 'feed_article'
  | 'expert'
  | 'company'
  | 'deal'
  | 'page_content'

interface AssistantContextSnapshot {
  version: 1
  id: string
  kind: AssistantContextKind
  title: string
  text: string
  sourceLabel?: string
  sourceUrl?: string
  capturedAt: string
}
```

Each component uses an allowlisted serializer over the data it already owns. The client-generated `id` is only a tray deduplication key and is never accepted as entity identity or authorization evidence.

This is preferred to serializing DOM because component data is predictable, localizable, testable, and free of controls or hidden markup. It is preferred to back-end resolvers because snapshots are intentionally user-supplied reference material rather than trusted system records.

### 3. Keep active context in `AnalystProvider` and provenance on user messages

`AnalystProvider` owns the active tray and exposes add, remove, and clear operations. Dropping or using an add action opens the panel but never sends a request. Active snapshots stay selected until removed or a different conversation is loaded.

Every submitted user message carries the current normalized snapshot set in an optional `contexts` property. This duplicates a bounded active set across turns, but gives each answer an auditable input and allows the latest user message to restore the active tray without a schema migration. Loading a legacy conversation with no contexts restores an empty tray. Starting a new conversation clears it.

Only the latest user message's contexts are injected into the provider request. Older message metadata remains stored for provenance but is stripped from provider message objects, preventing stale or removed snapshots from silently becoming active again.

### 4. Validate and render snapshots at one server boundary

A focused server module parses snapshot input without a new validation dependency. It rejects malformed messages, unknown versions/kinds, unsupported URL schemes, control characters, and limit violations. Limits are five snapshots, 8,000 text characters per item, 25,000 text characters total, 200 title characters, 120 source-label characters, and 2,048 URL characters.

Valid snapshots are rendered into a bounded reference block appended to the latest user message, not the system prompt. The block identifies each item, its capture time and provenance, and explicitly states that embedded content is untrusted reference material rather than instructions. Provider SDKs continue receiving only standard `{role, content}` messages.

Rejecting invalid input is preferred to silent truncation because truncation can change medical, regulatory, or investment meaning. Existing authentication, rate limiting, usage logging, topical guardrails, and tool authorization continue to apply.

### 5. Use one internal drag MIME with an ephemeral token plus an explicit action

At drag start the provider places the complete snapshot in an in-memory registry and puts only an opaque, short-lived token under `application/x-reporting-assistant-context` in `DataTransfer`. The host detects only this MIME type and replaces the compact edge launcher with a full-height right-edge drop target; the open panel remains a valid target too. Drag end removes unused entries. External HTML, text, files, forged tokens, and foreign drag payloads are ignored.

This is preferred to serializing the snapshot in `DataTransfer` because dragging outside the browser or into another application must not expose Feed, Expert, Company, or Deal content. The explicit add action bypasses the drag registry and adds the same snapshot directly.

Each supported item also exposes a localized action using “Drag to Assistant” language on pointer-capable desktop layouts and “Send to Assistant” on mobile layouts. The action remains keyboard-activatable at every width and is the primary touch path.

### 6. Integrate the first five surfaces through small allowlisted serializers

- Search result: visible title, snippet, source/adapter label, date, public identifier, and source URL.
- Feed article: visible title, summary or already-loaded body text, source, publication date, and URL; it never claims unread full text.
- Expert: visible name, title, organization, specialty/profile text, scope, and verification label.
- Company: visible name, stage/status, industry, current metrics/summary already held by the card.
- Deal: visible company, founder, stage/status, source, fit, industry, raise amount, and summary already held by the row/card.

Shared UI helpers own drag affordance and add action, but serializers stay close to domain types so they cannot accidentally spread entire business objects.

### 7. Bind conversation updates to the current trusted scope

Global availability makes it easier to navigate between scopes while a conversation ID is still present. Before updating an existing conversation, the API resolves it by user and Fund and verifies that stored `company_id`, `deal_id`, and `scope` exactly match the current server-derived scope. A mismatch fails closed instead of writing one domain's messages into another domain's thread. The update query also retains user and Fund predicates.

### 8. Use progressive disclosure for dense Feed lists

Feed rows opt into a compact presentation of the shared context-source action. On devices that support hover with a fine pointer, an unselected icon-only drag handle appears when its row is hovered or receives keyboard focus; a selected check remains visible. On touch/coarse-pointer devices at any viewport width, the compact icon stays visible because hover is unavailable and clicking it remains the touch-equivalent send action.

The article row itself is not draggable. Keeping drag initiation on the dedicated handle avoids conflicts with opening titles, selecting summary text, scrolling, and native links. The bookmark and assistant controls share one stable trailing action area so revealing the handle does not move article content. Other product surfaces retain the default shared action until their own density requires the compact variant.

## Risks / Trade-offs

- **Snapshot text can contain prompt injection** → Treat it as user-provided data, keep it out of the system-instruction region, delimit it, and tell the model not to follow embedded instructions.
- **A client can forge any snapshot** → Never derive permission, entity identity, or write authority from snapshot fields; all actions retain existing server validation.
- **Duplicating active context on each user message grows conversation JSON** → Keep strict item/character limits and only inject the latest active set into the provider call.
- **Removing page-local mounts may regress specialized layouts** → Preserve scope setters, test singleton counts, and exercise Company, Deal, Accounting, LP, and Diligence in the browser.
- **Native drag/drop does not cover touch** → Require an explicit add action everywhere and verify it at mobile width.
- **Search or Feed cards may only hold snippets** → Label the material as a captured page snapshot and never imply full-source retrieval.
- **A dock can over-compress dense pages near 1280px** → Bound resizing to 320–560px, retain at least 720px for the application region, let existing responsive page layouts collapse naturally, and verify dense list pages at the breakpoint.
- **A stale conversation ID can cross page scopes** → Verify user, Fund, company, deal, and derived domain scope before every conversation update.

## Migration Plan

1. Land shared types, parser, prompt renderer, and contract tests.
2. Extend Analyst messages/provider state and panel chips while retaining current page-local launchers temporarily.
3. Mount the singleton launcher/panel in `AppShell`, remove all page-local mounts, and verify existing scopes.
4. Add serializers and accessible actions to Search, Feed, Expert, Company, and Deal surfaces.
5. Run focused/full verification and authenticated desktop/mobile browser acceptance.

Rollback removes the global mount and context integrations and restores page-local launcher/panel imports. Conversation messages containing optional `contexts` remain backward-compatible JSON and are ignored by older clients.

## Open Questions

None. The first version intentionally limits capture to structured data already held by Reporting components.
## Consistent repeated-surface source actions

Repeated content surfaces use the shared `compact-hover` presentation rather than page-local text or icon styling. Search results, Expert cards, Dashboard company cards, Deal table rows, Deal board cards, and Feed rows mark their nearest repeated container as the hover/focus group and opt into the same 36px target and 16px icon contract. Fine-pointer users reveal an unselected action on row/card hover or focus, touch/coarse-pointer users retain an always-visible action, and selected state remains visible. Standalone detail action semantics are unchanged.
