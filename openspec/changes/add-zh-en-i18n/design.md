## Context

The Next.js 14 App Router application currently has no localization dependency, renders `<html lang="en">`, and stores visible copy directly in Server and Client Components. Its existing middleware performs authentication, portal redirects, token-route handling, and pathname-based authorization, so adding locale prefixes would expand the blast radius across every route and access contract. The first delivery needs a reliable English/Simplified Chinese product UI while preserving all existing URLs and business data semantics.

The first user-visible scope was the document shell, authenticated navigation and theme controls, public/portal chrome, authentication entry points, and shared language-switching feedback. The completed product scope now covers every user-visible page: authenticated workflows, public marketing and legal pages, explainers, setup and token entry points, and LP portal pages. Import is only the first reference implementation, not the delivery boundary.

## Goals / Non-Goals

**Goals:**

- Resolve exactly `en` or `zh-CN` on every request with a validated, deterministic fallback.
- Render localized copy consistently in Server and Client Components.
- Let users switch language without changing or losing the current pathname, route parameters, query string, or authentication state.
- Persist the choice in the current browser and expose the correct HTML language to assistive technology.
- Establish message, test, and formatting conventions that support incremental feature-page migration.
- Ensure every user-visible page renders its product-authored headings, guidance, controls, statuses, validation, and result summaries in the active locale rather than mixing Chinese chrome with English content.

**Non-Goals:**

- Locale-prefixed or localized URLs, alternate-language SEO URLs, or domain routing.
- Account-level or cross-device preference synchronization.
- Translation of database values, user-authored content, identifiers, routes, API enums, or permission keys.
- Automatic translation of email, PDF, Letter, export, or AI-generated content.
- Changing the fund's configured currency when the UI language changes.

## Decisions

### Use `next-intl` in request-scoped, no-routing mode

`next-intl` supplies one API across Server and Client Components, ICU-compatible messages, and locale-aware formatters while supporting this project's Next.js and React versions. The Next.js plugin points to `i18n/request.ts`, and the root layout supplies `NextIntlClientProvider`.

Alternatives considered:

- Hand-rolled React context: smaller initial dependency but duplicates server/client resolution, interpolation, pluralization, and formatting behavior.
- Locale-prefixed App Router tree: appropriate for localized SEO URLs but requires moving routes and composing locale routing with security-sensitive middleware.
- Client-only localStorage: cannot render the correct server response or HTML language and causes visible hydration/flicker problems.

### Keep URLs stable and persist a validated cookie

The supported locale registry is a frozen allowlist containing `en` and `zh-CN`. Resolution order is a valid `NEXT_LOCALE` cookie, then a supported browser `Accept-Language` preference, then `en`. A same-origin JSON endpoint accepts only an exact one-field locale payload, bounds the request body, writes a same-site, path-wide, production-secure HttpOnly cookie, and the client refreshes the current route. No locale value is added to `fund_settings` or any other shared fund record.

The cookie value is untrusted input. Message loading uses an explicit loader map keyed by the validated locale; arbitrary cookie values never become import paths. Both allowlisted catalogs are statically imported and returned through that map so development refreshes do not depend on generated RSC JSON chunks.

### Use one nested catalog per locale with semantic namespaces

`messages/en.json` and `messages/zh-CN.json` contain identical key structures organized by semantic namespaces such as `Common`, `Navigation`, `Theme`, `Auth`, `PublicChrome`, and `PortalChrome`. English is the source catalog for type augmentation and parity tests. Components reference semantic keys rather than using English source text as identifiers.

This keeps the initial contract easy to validate. Catalogs can be split by feature later behind the same loader without changing component APIs.

### Localize shared chrome, then every complete feature-page namespace

The implementation first localizes the surfaces a user encounters while entering and navigating the product: root metadata/document language, language selector, authenticated sidebar, theme labels, public/portal chrome, and authentication pages. It then migrates every user-visible route and its page-level component graph one complete namespace at a time. Import is the reference pattern. No reachable page may intentionally retain product-authored English headings, guidance, controls, statuses, validation, or result summaries when the active locale is Chinese.

Business values stay outside this translation boundary. Company and fund names, filenames, pasted data, API enums, user-authored content, and backend-provided issue details remain unchanged; only the surrounding product UI is localized.

Navigation hrefs, access metadata, icons, feature keys, and permission domains remain stable. Only human-readable labels become message keys.

### Separate locale formatting from business currency

UI dates and numbers migrated in this change use locale-aware formatting. Currency continues to use the fund's configured ISO currency. Existing legal/investor documents with explicitly fixed formatting remain unchanged until their own document-language contract is defined.

### Reuse the established visual system

The selector uses the existing Lucide icon set, semantic Tailwind tokens, focus rings, and responsive sidebar/header patterns. It provides a visible label or accessible name, exposes the current selection, supports keyboard operation, and maintains at least a 44px interactive target. No new visual theme or decorative motion is introduced.

## Risks / Trade-offs

- **[Root request reads make otherwise static pages dynamic]** → Accept for the cookie-based first delivery; measure before expanding public marketing localization. Use prefixed routes later if localized SEO/static generation becomes a requirement.
- **[Large existing English surface can produce mixed-language feature pages]** → Define and test the initial shared scope, then migrate complete feature namespaces rather than scattered strings.
- **[Missing or divergent catalog keys fail at runtime]** → Add catalog parity and supported-locale contract tests, TypeScript message augmentation, and an English fallback strategy for unexpected runtime gaps.
- **[CJK text changes width and font fallback]** → Use the existing system fallback chain for Chinese, allow labels to wrap where appropriate, and verify desktop/mobile light/dark layouts in the real browser.
- **[Dirty worktree overlaps shared chrome]** → Make focused patches against current files, preserve unrelated changes, and review the final diff by path.
- **[Authentication or access redirects regress]** → Do not alter pathname structure or middleware routing; verify the same authenticated and public entrypoints before and after switching.

## Migration Plan

1. Add the dependency, locale registry, request configuration, catalogs, provider, and parity tests.
2. Add the cookie-writing same-origin endpoint and reusable language selector.
3. Migrate shared authenticated, public, portal, and authentication chrome without changing their route/access metadata.
4. Inventory every user-visible route and the page-level components that render its content.
5. Migrate all authenticated, public/legal/explainer/setup/token, and LP portal pages as complete semantic namespaces while preserving business values and behavior.
6. Run full-surface contract tests, type checking, production build, and HarnessKit checks.
7. Exercise English → Chinese → reload/new tab → English in the real browser across representative routes from every page family.

Rollback removes the provider/action/catalog wiring and dependency; because the change adds no database schema and does not change URLs, the existing English literals and route contracts can be restored independently.

## Open Questions

- Public marketing pages are localized in this change, but whether they should later receive locale-prefixed SEO routes is intentionally deferred.
- Whether language should sync across devices is intentionally deferred until a dedicated personal-preferences model is approved.
