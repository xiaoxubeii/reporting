## 1. Contracts and tests

- [x] 1.1 Add failing service coverage for the additive all-category catalog projection while preserving non-empty topic cards
- [x] 1.2 Add failing UI/localization contract coverage for the anchored menu, inline creation, and removal of the permanent topic field

## 2. Catalog and UI implementation

- [x] 2.1 Expose all Miniflux categories in the source catalog response and client types without changing the subscription endpoint
- [x] 2.2 Implement the controlled category popover for discovered and listed source Follow actions
- [x] 2.3 Add inline new-category validation, scoped pending/error recovery, responsive sizing, and keyboard dismissal
- [x] 2.4 Add parity-checked English and Simplified Chinese category-menu copy
- [x] 2.5 Restyle the Follow trigger and category popover to match the supplied folder-picker reference, including search/filter, arrow, folder rows, and New Folder footer
- [x] 2.6 Align the reference composition with Reporting's standard control dimensions and semantic light/dark theme tokens

## 3. Verification and review

- [x] 3.1 Run focused tests, targeted lint/type checks, strict OpenSpec validation, and diff hygiene checks
- [x] 3.2 Complete code and UI/UX review and address in-scope findings
- [x] 3.3 Verify uncategorized, existing-category, new-category, failure/dismissal, and desktop/mobile behavior in the real authenticated browser flow
- [x] 3.4 Record HarnessKit evidence and completion state
- [x] 3.5 Add visual contract coverage and verify the reference-style picker in the real English/Chinese desktop and mobile browser flow
- [x] 3.6 Add a regression contract for compact theme-aware styling and rerun focused UI verification
