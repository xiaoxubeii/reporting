## 1. Contract and regression coverage

- [x] 1.1 Add focused contract coverage for the diligence tab order, Research team placement, compact pre-research state, and localized labels.
- [x] 1.2 Add unit coverage for deterministic founder-dossier merge behavior across Research reruns.

## 2. Research workspace implementation

- [x] 2.1 Remove the top-level Founders tab and render a compact Founders & Core Team section after Competitive Landscape using the Research tab's state and patch path.
- [x] 2.2 Replace inline dossier editing with an accessible right-side sheet and preserve add, edit, remove, source, and open-question behavior.
- [x] 2.3 Localize the new section, summaries, pre-research state, editor, and actions in English and Simplified Chinese.

## 3. Safe Research reruns

- [x] 3.1 Implement a pure deterministic merge that preserves existing dossier values/order, appends unique generated sources, and adds newly discovered founders.
- [x] 3.2 Integrate the merge into Research persistence without changing the database or API contract.

## 4. Verification and review

- [x] 4.1 Run OpenSpec validation, focused tests, TypeScript/targeted checks, and HarnessKit fast/targeted verification.
- [x] 4.2 Complete code and UI/UX review and address in-scope findings.
- [x] 4.3 Verify the real authenticated diligence Research flow in English and Simplified Chinese, including compact empty state and dossier sheet interaction.
