## 1. Contract and Test Foundation

- [x] 1.1 Register the `ui-localization` feature in the HarnessKit feature plan with its scope, serial dependency order, verification tier, and review requirements.
- [x] 1.2 Add focused tests for the supported-locale allowlist, cookie/browser fallback resolution, safe loader mapping, and English/Chinese catalog key parity.

## 2. Internationalization Runtime

- [x] 2.1 Add the compatible `next-intl` dependency and configure its Next.js request plugin without locale routing.
- [x] 2.2 Implement the immutable locale registry, validated request resolver, explicit catalog loader map, and TypeScript message augmentation.
- [x] 2.3 Add matching English and Simplified Chinese catalogs for the initial shared namespaces.
- [x] 2.4 Wire the root provider, request locale, localized metadata, and dynamic HTML `lang` attribute.

## 3. Language Selection and Shared Chrome

- [x] 3.1 Implement the validated same-origin locale-cookie endpoint and accessible, responsive language selector that preserves the active URL.
- [x] 3.2 Localize authenticated navigation, theme controls, mobile/desktop shell labels, and shared sign-out copy without changing href/access metadata.
- [x] 3.3 Localize public and portal navigation chrome and expose the language selector on unauthenticated surfaces.

## 4. Authentication Entry Points

- [x] 4.1 Localize the authentication layout and sign-in page, including headings, fields, actions, validation, and status messages.
- [x] 4.2 Localize sign-up, magic-link, forgot/reset-password, and MFA entry points without changing authentication behavior.

## 5. Verification and Review

- [x] 5.1 Run focused tests, TypeScript, OpenSpec strict validation, and HarnessKit fast/targeted/full verification; resolve in-scope failures.
- [x] 5.2 Run correctness, security, accessibility, responsive, and localization reviews; resolve critical and high findings.
- [x] 5.3 Exercise the real English-to-Chinese-to-English browser flow on authenticated and unauthenticated entrypoints, including reload persistence, dynamic-route/query preservation, mobile layout, dark mode, console errors, and failed requests.
- [x] 5.4 Record final evidence in HarnessKit state and confirm no bootstrap markers or unfinished localization tasks remain in the declared initial scope.

## 6. Complete Product Surface

- [x] 6.1 Add focused coverage for complete business-page namespace migration and extend both catalogs with matching semantic keys.
- [x] 6.2 Localize the complete Import page and metadata, including document upload, company metrics, investment data, fund cash flows, statuses, validation, and result summaries.
- [ ] 6.3 Inventory every `app/**/page.tsx` route and its page-level rendering components; classify visual pages versus redirect/transport-only routes and bind every visual page to a semantic namespace.
- [ ] 6.4 Localize all authenticated application pages and their page-level shared components while preserving business values, permissions, and route behavior.
- [ ] 6.5 Localize all public marketing, legal, explainer, setup, onboarding, submission, expert-response, and other user-visible entry pages, including localized metadata.
- [ ] 6.6 Localize all LP portal pages and their page-level shared components while preserving investor data and authorization behavior.
- [ ] 6.7 Add full-route localization coverage that fails for an unclassified page, missing namespace, catalog divergence, or product-authored literal that bypasses the catalog.
- [ ] 6.8 Verify the complete page surface with focused and full tests, type checking, targeted linting, production build, strict OpenSpec validation, and HarnessKit verification.
- [ ] 6.9 Exercise English-to-Chinese-to-English switching across representative authenticated, public/legal, setup/token, and LP portal pages in the real browser, including reload persistence, responsive layouts, console errors, and failed requests.
- [ ] 6.10 Run correctness, security, accessibility, responsive, and localization reviews for the complete product-page scope and record final HarnessKit evidence.
