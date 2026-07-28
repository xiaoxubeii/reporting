## 1. Contract and Configuration

- [x] 1.1 Add focused tests for demo URL validation, canonical workspace-entry parsing, reserved/foreign input rejection, and legacy self-host omission.
- [x] 1.2 Implement immutable platform-landing configuration and workspace-entry helpers without Fund lookup or private service access.
- [x] 1.3 Add the optional `FUND_WORKSPACE_DEMO_URL` deployment example and concise operator documentation.

## 2. Platform-Only Page Architecture

- [x] 2.1 Add contract tests proving platform `/` receives the dedicated full-width shell while tenant `/` and other public routes retain their existing renderers and chrome.
- [x] 2.2 Split the public layout into a server-side trusted Host classifier and the existing client auth/shell implementation, then add the platform-root-only full-width branch without changing tenant, legacy self-host, GP, LP Portal, or authenticated redirect behavior.
- [x] 2.3 Replace only the platform branch of the public homepage with a focused `PlatformLanding` component and remove its GitHub-star, pricing-plan, and generic fourteen-step runtime dependencies.

## 3. Institutional Landing Experience

- [x] 3.1 Add verified non-sensitive Research/expert, Deal, and portfolio screenshot assets under `public/landing/` with documented provenance.
- [x] 3.2 Implement the hero, product-evidence, differentiation, continuous-workflow, expert-validation, capability, trust, and final-CTA sections using the approved institutional visual system.
- [x] 3.3 Implement the accessible existing-workspace dialog/form with generic validation, focus restoration, canonical `/auth` navigation, and configured/legacy visibility behavior.
- [x] 3.4 Add complete English and Simplified Chinese landing copy, metadata, image descriptions, form labels, validation messages, and navigation labels.
- [x] 3.5 Add responsive and reduced-motion styles that preserve content order, visible focus, 320px layout, and 200% text zoom without horizontal page overflow.

## 4. Verification and Review

- [x] 4.1 Run focused unit/component/localization/host-contract tests, changed-scope lint and type checks, strict OpenSpec validation, and HarnessKit fast/targeted verification.
- [x] 4.2 Run the production build and full risk-routed test suite, recording any unrelated repository blockers separately from changed-scope evidence.
- [x] 4.3 Run real browser acceptance on the platform root in English/Chinese desktop and 390px mobile, including configured/unconfigured demo CTA, keyboard workspace entry, reduced motion, console/network inspection, and screenshot capture.
- [ ] 4.4 Run real browser regression on a valid tenant public homepage, tenant `/auth`, an authenticated GP workspace, LP Portal, and one non-root public explainer route.
- [x] 4.5 Complete correctness, accessibility/design, and security reviews; resolve all in-scope high/critical findings and record final evidence in HarnessKit state.

## 5. Simplified Executive Landing

- [ ] 5.1 Replace the floating navigation and connected-surfaces Hero with one compact navigation, dual CTA Hero, and one verified product view.
- [ ] 5.2 Replace repeated capability stories with three management outcomes and one accessible five-step workflow.
- [ ] 5.3 Consolidate expert validation, traceability, closing conversion, and footer content.
- [ ] 5.4 Update English and Simplified Chinese copy and focused contract tests.
- [ ] 5.5 Run changed-scope, build, browser, and platform/tenant regression verification.
