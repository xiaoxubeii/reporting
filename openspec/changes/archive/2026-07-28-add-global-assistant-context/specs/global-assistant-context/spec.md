## ADDED Requirements

### Requirement: Authenticated application has one global assistant
The system SHALL render exactly one assistant launcher and one assistant panel from the authenticated application shell when an AI provider is configured, SHALL exclude public/authentication and full-screen preview surfaces, and SHALL preserve existing Company, Deal, Vehicle, LP, and Diligence scope synchronization.

#### Scenario: Assistant is available on a wide authenticated page
- **WHEN** a user with a configured AI provider opens any normal authenticated application route
- **THEN** one keyboard-accessible launcher is present on the right edge and opens one 400px-default full-height dock that reflows the application content at widths of at least 1280px

#### Scenario: Desktop user resizes the dock
- **WHEN** a desktop user drags the dock separator or uses its keyboard controls
- **THEN** the dock width SHALL remain between 320px and 560px, preserve at least 720px for the application region, expose localized separator semantics, and persist the selected width locally

#### Scenario: Assistant opens below the desktop dock breakpoint
- **WHEN** the viewport is narrower than 1280px and the user opens the assistant
- **THEN** the same assistant SHALL open in an accessible full-height right drawer without permanently reducing page width, using a near-full-width drawer below 768px

#### Scenario: Full-screen preview remains isolated
- **WHEN** the LP full-screen preview is rendered
- **THEN** the application SHALL NOT render the global assistant launcher or panel

#### Scenario: Existing business scope survives global mounting
- **WHEN** the user opens a Company, Deal, Vehicle, LP, or Diligence surface and opens the global assistant
- **THEN** the request SHALL carry the same server-validated business scope that the former page-local assistant used

### Requirement: Components produce typed page snapshots
The system SHALL accept only versioned `AssistantContextSnapshot` objects constructed from allowlisted plain-text or structured data already held by Reporting components and SHALL NOT serialize DOM, `innerHTML`, hidden business-object fields, or arbitrary external drag content.

#### Scenario: Supported component creates a snapshot
- **WHEN** a supported component creates assistant context
- **THEN** it SHALL include version, kind, client deduplication ID, title, plain text, capture time, and optional source label and HTTP(S) URL

#### Scenario: Foreign drag data is ignored
- **WHEN** content without Reporting's assistant-context MIME type is dragged over or dropped on the launcher
- **THEN** the launcher SHALL NOT add context or call the Analyst API

#### Scenario: Drag data leaves the application
- **WHEN** a supported item begins a drag operation
- **THEN** the browser `DataTransfer` payload SHALL contain only an opaque ephemeral token and SHALL NOT contain the snapshot title, text, source, URL, or business fields

### Requirement: Users explicitly manage active context
The system SHALL let users add, deduplicate, inspect, remove, and clear active page snapshots without automatically sending a message or executing an action.

#### Scenario: Desktop user drops a valid snapshot
- **WHEN** a valid Reporting snapshot is dragged toward and dropped on the full-height right-edge target or open assistant
- **THEN** the panel SHALL open, one context chip SHALL appear, and no AI request SHALL be sent

#### Scenario: Duplicate snapshot is added
- **WHEN** a snapshot with the same version, kind, and ID is already active
- **THEN** the active tray SHALL keep one copy

#### Scenario: User removes context
- **WHEN** the user removes one chip or clears the tray
- **THEN** subsequent messages SHALL omit the removed snapshot

### Requirement: Drag has an accessible equivalent
Every supported object SHALL provide a localized, keyboard-accessible action that produces the same context as drag/drop, uses “Drag to Assistant” language on desktop and “Send to Assistant” on mobile, and works at mobile widths.

#### Scenario: Mobile user adds an item
- **WHEN** a user activates “Send to Assistant” on a supported item at mobile width
- **THEN** the assistant SHALL open and display the same context chip that desktop drag/drop would create

### Requirement: Initial product surfaces expose bounded snapshots
Search results, Feed articles, Experts, Companies, and Deals SHALL expose allowlisted snapshots containing only fields already visible or intentionally summarized by their front-end component.

#### Scenario: Search result contains a snippet only
- **WHEN** the front end holds only a search-result title and snippet
- **THEN** the snapshot SHALL contain only that available material and SHALL identify it as a captured search result rather than fetched full text

#### Scenario: Multiple domain items are combined
- **WHEN** a user adds supported items from different surfaces to the same conversation
- **THEN** the active tray SHALL preserve each item's kind, title, capture time, and source provenance for comparative questions

### Requirement: Dense Feed lists use progressive disclosure
Each Feed article SHALL keep a dedicated, icon-only assistant action without making the article row itself draggable.

#### Scenario: Fine-pointer user discovers the Feed drag handle
- **WHEN** a user on a hover-capable fine-pointer device hovers a Feed row or focuses a control within it
- **THEN** the row SHALL reveal its dedicated assistant drag handle without shifting article content

#### Scenario: Touch user accesses the compact Feed action
- **WHEN** a Feed row is rendered on a touch or coarse-pointer device at any viewport width
- **THEN** its compact assistant action SHALL remain visible and keyboard/touch activatable without requiring hover

#### Scenario: Feed article is already selected
- **WHEN** the article snapshot is already present in active assistant context
- **THEN** the compact selected check SHALL remain visible without requiring row hover

### Requirement: Conversation messages preserve snapshot provenance
The system SHALL store the current normalized snapshot set on the submitted user message in the existing conversation JSON, SHALL restore active context from the latest user message when a conversation is loaded, and SHALL remain compatible with messages that have no snapshot metadata.

#### Scenario: Conversation is reopened
- **WHEN** a user reopens a conversation whose latest user message contains snapshots
- **THEN** those snapshots SHALL be restored to the active tray and past user messages SHALL display their source provenance

#### Scenario: Legacy conversation is reopened
- **WHEN** a stored conversation contains only role and content fields
- **THEN** it SHALL load normally with an empty active context tray

#### Scenario: New conversation is started
- **WHEN** the user starts a new conversation
- **THEN** previous messages and active page snapshots SHALL be cleared

### Requirement: Snapshot input is strictly bounded
The Analyst API SHALL validate every submitted snapshot as untrusted input, reject malformed or excessive input with status 400, and accept no more than five snapshots, 8,000 text characters per snapshot, 25,000 snapshot text characters total, 200 title characters, 120 source-label characters, and 2,048 URL characters using only HTTP(S) URLs.

#### Scenario: Valid snapshots are accepted
- **WHEN** the latest user message contains snapshots within all schema and size limits
- **THEN** the API SHALL normalize them and continue through the existing authenticated Analyst path

#### Scenario: Malformed or excessive snapshots are submitted
- **WHEN** a snapshot has an unknown version or kind, invalid field type, control characters, unsupported URL scheme, or exceeds a limit
- **THEN** the API SHALL return a clear 400 response and SHALL NOT call an AI provider or persist the request

### Requirement: Page snapshots remain untrusted reference material
The system SHALL combine valid snapshots with existing server-resolved business context without granting permission or identity from snapshot fields, SHALL inject only the latest active snapshot set into the corresponding user message rather than the system instruction region, and SHALL send providers only standard role/content messages.

#### Scenario: Snapshot contains instructions or entity identifiers
- **WHEN** snapshot text contains instruction-like text, a Fund ID, entity ID, name, or URL
- **THEN** the system SHALL label it as untrusted reference material and SHALL NOT use it to expand read access or authorize a write

#### Scenario: Existing write tool is proposed
- **WHEN** an answer based on a snapshot leads to a drafted operation
- **THEN** the operation SHALL remain subject to the existing server Session, Fund, domain permission, and approval checks

#### Scenario: Context is removed on a later turn
- **WHEN** the latest user message omits a snapshot that appeared on an older message
- **THEN** that older snapshot SHALL remain stored for provenance but SHALL NOT be injected as active context for the new provider call

#### Scenario: Existing conversation belongs to another scope
- **WHEN** a request supplies a conversation ID whose stored Fund, Company, Deal, or derived domain scope does not match the current server-validated request scope
- **THEN** the API SHALL reject the update and SHALL NOT persist messages or call the provider for that thread

### Requirement: Global assistant is localized and responsive
The launcher, drop state, context tray, item actions, validation feedback, and source labels SHALL be available in English and Simplified Chinese and SHALL remain usable without horizontal overflow at desktop and mobile widths.

#### Scenario: User switches locale
- **WHEN** the application locale changes between English and Simplified Chinese
- **THEN** all new user-visible assistant context controls and accessible names SHALL use the selected locale

#### Scenario: Open assistant crosses a responsive breakpoint
- **WHEN** an open assistant changes between dock and drawer presentation
- **THEN** focus SHALL remain within the open assistant and the page SHALL NOT gain horizontal overflow
### Requirement: Repeated content surfaces share one compact source action

The system SHALL render the shared compact assistant action on every supported repeated list, table, board, and card source surface without introducing page-specific icon geometry or visibility behavior.

#### Scenario: Fine-pointer user scans repeated content

- **WHEN** an eligible Search result, Expert card, Dashboard company card, Deal table row, Deal board card, or Feed row is neither hovered nor focused and is not selected
- **THEN** its reserved compact action MAY be visually hidden without shifting content
- **AND WHEN** the nearest repeated container is hovered or contains focus
- **THEN** the 36px action with a 16px icon becomes available

#### Scenario: Touch user or selected context

- **WHEN** the device lacks hover/fine-pointer capability
- **THEN** the compact action remains visible and clickable
- **AND WHEN** the source is already selected as context
- **THEN** the selected icon remains visible on every supported device
