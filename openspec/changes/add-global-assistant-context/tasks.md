## 1. Shared Contract and Security Boundary

- [x] 1.1 Add immutable Analyst conversation-message and versioned page-snapshot types without widening provider `ChatMessage`.
- [x] 1.2 Write failing contract tests for valid snapshots, strict fields, deduplication, control characters, URL schemes, item/field/total limits, and input immutability.
- [x] 1.3 Implement client/server snapshot normalization and the bounded untrusted-reference renderer.
- [x] 1.4 Write route tests proving snapshots stay out of system instructions, providers receive role/content only, invalid input fails before provider/persistence, and existing trusted scopes cannot be forged.
- [x] 1.5 Enforce Fund/user/business-scope equality before updating an existing conversation and cover mismatches with tests.

## 2. Global Assistant State and Presentation

- [x] 2.1 Write React state tests for add/deduplicate/remove/clear, active-context continuity, new-conversation clearing, and legacy/history restoration.
- [x] 2.2 Extend `AnalystProvider` with immutable active snapshots and an ephemeral in-memory drag-token registry.
- [x] 2.3 Add the singleton lower-right floating host with valid-drag feedback, safe-area positioning, localized accessible names, and no-AI/full-screen-preview gating.
- [x] 2.4 Add pending and historical context chips to the panel, preserve active context across successful turns, retain it on failure, and never auto-send on add/drop.
- [x] 2.5 Persist normalized active snapshots on user messages and restore them when loading an existing conversation.

## 3. Global Mount and Existing Scope Preservation

- [x] 3.1 Mount exactly one floating host/panel in `AppShell` and remove all page-local Analyst launcher/panel instances.
- [x] 3.2 Extract Company scope synchronization from its former button and preserve Deal, Vehicle, LP, Diligence, and default Fund behavior.
- [x] 3.3 Add tests or inventory assertions preventing duplicate launchers/panels and missing scope synchronizers.

## 4. Shared Source Interaction

- [x] 4.1 Write interaction tests for opaque drag tokens, forged/foreign payload rejection, keyboard/touch add parity, deduplicated chips, and no automatic request.
- [x] 4.2 Implement a reusable context-source affordance with a dedicated drag handle and localized “Add to assistant” action.
- [x] 4.3 Ensure the context-source contract serializes allowlisted component data only and never spreads full domain objects or DOM/HTML.

## 5. Initial Surface Integrations

- [x] 5.1 Add allowlisted snapshots and drag/add actions to Feed and all Search result variants, including snippet-only provenance.
- [x] 5.2 Add allowlisted snapshots and drag/add actions to Expert cards and Dashboard Company cards.
- [x] 5.3 Add allowlisted snapshots and drag/add actions to Deal table and Board cards without interfering with Board status drag/drop.
- [x] 5.4 Add focused serializer/component tests containing hidden fixture fields to prove they do not enter snapshots.

## 6. Localization and Responsive UX

- [x] 6.1 Add complete English and Simplified Chinese launcher, drop-target, chip, add-action, source, and validation copy and update the UI-surface inventory.
- [x] 6.2 Verify focus behavior, tooltip/accessible naming, high-contrast semantic tokens, mobile drawer controls, safe-area offsets, and no horizontal overflow.

## 7. Verification and Handoff

- [x] 7.1 Run focused tests, TypeScript, changed-file ESLint, strict OpenSpec, HarnessKit fast/targeted, `git diff --check`, and secret/bootstrap scans.
- [x] 7.2 Run the full Vitest suite and production build, recording any unrelated repository blocker with reproducible evidence.
- [x] 7.3 Complete correctness, security, and UI/UX reviews and resolve all medium/high/critical findings.
- [x] 7.4 Exercise authenticated desktop drag/drop and combined questioning plus 390px add-action/history/scope flows in the real browser; inspect console/network failures and capture evidence.
- [x] 7.5 Update HarnessKit feature state/progress with acceptance evidence and prepare a clean feature commit and merge handoff.

## 8. Docked Assistant Refinement

- [x] 8.1 Add regression tests for the 1280px dock contract, narrow-screen drawer contract, right-edge launcher/drop target, focus return, and localized desktop/mobile source actions.
- [x] 8.2 Replace the floating desktop panel with a 400px full-height shell dock that expands the shell to 1680px while open and restores the 1280px content layout when closed.
- [x] 8.3 Replace the lower-right bubble with a compact right-edge launcher and full-height valid-drag target; preserve opaque-token consumption and no-auto-send behavior.
- [x] 8.4 Use a full-height 400px drawer from 768px through 1279px and a near-full-width drawer below 768px without horizontal overflow.
- [x] 8.5 Update English and Simplified Chinese source-action, launcher, and drop-target copy to “Drag to Assistant” / “Send to Assistant” semantics.
- [x] 8.6 Run focused tests, TypeScript, changed-file lint, strict OpenSpec, HarnessKit verification, and authenticated desktop/tablet/mobile browser acceptance with screenshots and console/network inspection.
- [x] 8.7 Complete correctness/security/UX review, add bounded pointer/keyboard desktop resizing, resolve header/height/breakpoint-focus findings, and refresh feature state and evidence for handoff.

## 9. Feed Drag Affordance Refinement

- [x] 9.1 Add regression tests for an icon-only Feed action that is revealed on hover-capable fine-pointer devices, remains available on touch/coarse-pointer devices at every width, and keeps selected state visible.
- [x] 9.2 Add an opt-in compact-hover presentation to the shared context action and apply it to non-draggable Feed rows beside the bookmark control.
- [x] 9.3 Run focused tests, TypeScript, changed-file lint, strict OpenSpec, HarnessKit verification, and authenticated desktop/mobile/touch-tablet Feed acceptance.
- [x] 9.4 Match compact drag and selected controls to the adjacent bookmark button's 36px target, 16px icon, and vertical alignment; verify both states in the authenticated Feed UI.

## 10. Cross-page Source Action Consistency

- [x] 10.1 Add failing inventory contracts requiring Search results, Expert cards, Dashboard company cards, Deal table rows, and Deal board cards to use the shared compact-hover presentation within their nearest hover/focus group.
- [x] 10.2 Apply the shared presentation without changing snapshots, navigation, table actions, or Deal board status drag/drop.
- [x] 10.3 Run focused tests, TypeScript, changed-file lint, strict OpenSpec and HarnessKit verification, authenticated desktop/touch browser acceptance, and independent review.
