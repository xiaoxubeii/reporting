## Why

The application currently renders all product chrome and workflows in English and hard-codes the document language as English. Supporting English and Simplified Chinese gives users a consistent, persistent interface language without disrupting the application's existing authentication, authorization, portal, and deep-link routes.

## What Changes

- Add request-scoped locale resolution for the supported locales `en` and `zh-CN`, defaulting safely to English.
- Add a persistent, per-browser language selector that changes language without changing the current URL, route parameters, or query string.
- Add localized message resources and locale-aware formatting primitives for Server and Client Components.
- Localize the global application shell, navigation, theme controls, authentication entry points, and shared interaction copy.
- Localize every user-visible application page as a complete semantic namespace, including authenticated workflows, public and legal pages, setup/token entry points, explainers, and LP portal pages, so switching to Chinese does not leave mixed-language product UI.
- Set the HTML document language to the active locale and preserve accessible, responsive behavior in both languages.
- Keep user-entered content, database identifiers, API contracts, currencies, generated reports, emails, and AI-generated content outside the UI-locale contract.

## Capabilities

### New Capabilities

- `ui-localization`: Resolves, validates, persists, and applies English or Simplified Chinese across the shared web UI while preserving existing routes and business data.

### Modified Capabilities

<!-- No existing project-owned capability requirements are modified. -->

## Impact

- Adds a Next.js-compatible internationalization dependency and request configuration.
- Adds locale/message modules, a language switcher, message catalogs, and focused contract tests.
- Updates the root layout, shared application/authentication chrome, and every user-visible page and page-level component to consume localized messages.
- Reads and writes one non-sensitive locale cookie; no database schema or authorization contract changes.
- Existing pathname-based middleware, APIs, and shared links remain unchanged.
