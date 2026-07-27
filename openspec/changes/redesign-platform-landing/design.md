## Context

`app/(public)/page.tsx` currently owns two different homepage contracts. A trusted tenant request renders the published Fund public site (or its uniform private state), while the platform request renders a long Reporting/Hemrock product tour inside the generic public sidebar shell. The platform page is localized and already uses real screenshots, but its fourteen-step structure, repeated rounded cards, old product identity, pricing blocks, and generic AI language no longer explain FundWorkspace's strongest workflow: signal discovery, Research, optional expert validation, IC decision, and ongoing portfolio/LP operations.

The implementation must retain the existing trusted tenant resolution and authenticated redirect behavior. It must not turn the anonymous platform page into a consumer of Fund records, Research APIs, expert records, or workspace membership lookup.

## Goals / Non-Goals

**Goals:**

- Give the unauthenticated platform root a distinctive institutional landing page with the approved editorial visual system.
- Make the complete investment-decision workflow the primary story and expert validation the principal differentiator.
- Use only real, non-sensitive FundWorkspace screenshots for product evidence.
- Provide localized, responsive, accessible demo and existing-workspace entry paths.
- Keep the tenant homepage, auth, application, and LP Portal contracts unchanged.

**Non-Goals:**

- Redesign Fund public-site templates, public explainer pages, authenticated application pages, or the LP Portal.
- Build a public Fund directory, membership lookup, demo-request backend, CRM integration, analytics product, or interactive fake product demo.
- Claim that every Research run is expert-validated or that expert evidence automatically changes every Research output.
- Add new product data, database migrations, or third-party UI dependencies.

## Decisions

### Keep tenant selection on the existing trusted server path

`HomePage` continues to call `loadTenantHome()` before rendering platform content. Tenant requests keep using `FundPublicSite` or `FundPublicSitePrivateState`; only the `null` platform branch changes. This preserves the current host-derived Fund boundary and prevents client-controlled hostname or query parameters from selecting a tenant.

Alternative considered: split platform and Fund homepages into different pathnames. Rejected because hosted isolation intentionally gives both origins the canonical `/` path and resolves them by trusted Host context.

### Classify the Host on the server before selecting the public shell

`app/(public)/layout.tsx` becomes a small Server Component that classifies the request Host with the existing tenancy helper and passes an immutable `hostMode` to `app/(public)/public-layout-client.tsx`, which owns the current authentication check, redirects, sidebar shell, and tenant-home bypass. The Client Component renders a full-width child-only shell only when `hostMode === 'platform' && pathname === '/'`. Tenant `/` remains chrome-free, legacy self-host `/` keeps the existing public shell, and all other public pages retain the existing sidebar shell. The platform page itself contains the compact brand header, locale switcher, demo CTA when configured, and existing-workspace action.

`TenantBrandingProvider` being `null` is deliberately not used as the platform signal because it also represents legacy self-host mode. Server-only environment and canonical-origin resolution never move into the client layout.

Alternatives considered: keep the sidebar and place the new sections inside it, or infer platform mode from a missing tenant provider. The first was rejected because the approved asymmetrical editorial layout needs full viewport width; the second was rejected because it would incorrectly convert legacy self-host `/` into the hosted platform landing.

### Decompose the landing by narrative responsibility

The platform branch of `app/(public)/page.tsx` delegates to focused components under `components/platform-landing/`:

- `platform-landing.tsx` owns section order and server-provided CTA configuration.
- `platform-landing-header.tsx` owns the responsive top navigation and actions.
- `product-evidence.tsx` frames real screenshots and adds explanatory annotations without redrawing product UI.
- `investment-workflow.tsx` explains Discover → Research → Expert Validation → IC → Portfolio & LP.
- `workspace-entry.tsx` owns the client-side dialog/form state for the existing-workspace redirect.

The page route retains tenant resolution, metadata, and server-only environment access. Components receive plain immutable props and do not read private services.

### Treat screenshots as evidence, not illustration

Landing assets are copied from verified local browser evidence or captured again from a non-sensitive test Fund. Cropping, masking, borders, shadows, arrows, and labels are allowed. Reconstructing a different dashboard, inventing metrics, or presenting fictional customers/usage as product output is not allowed. Each screenshot has localized adjacent copy and meaningful alternative text; decorative framing is hidden from assistive technology.

### Validate the optional demo URL on the server

`FUND_WORKSPACE_DEMO_URL` is optional and server-only. A pure parser accepts only an absolute HTTPS URL without credentials and returns `null` for missing or invalid values. A server-only loader emits one process-local configuration warning when hosted platform mode has no usable value, and never renders a broken link. The CTA opens with `target="_blank"` and `rel="noopener noreferrer"`. The environment example and deployment documentation name the setting, but no external scheduling vendor is hard-coded.

Alternative considered: an internal form. Rejected for this release because it would add persistence, email delivery, spam control, and personal-data handling outside the landing redesign.

### Redirect workspace input without enumerating Funds

The server passes the already configured canonical platform origin to `WorkspaceEntry`. A pure helper accepts either one valid Fund slug or a canonical tenant hostname/address under that root, rejects reserved labels, IDN/punycode, foreign hosts, credentials, paths other than `/` or `/auth`, queries, fragments, and ambiguous multi-label subdomains, then constructs the tenant `/auth` URL. The client navigates directly to that canonical URL.

The flow never calls Supabase, checks membership, or reports whether a valid-looking Fund exists. Invalid syntax receives one localized generic error; an unknown but syntactically valid Fund resolves at the tenant host through the existing uniform unknown-host behavior.

Alternative considered: email-based membership lookup. Rejected because it would disclose account/Fund relationships and introduce an anonymous identity-discovery endpoint.

### Use a restrained institutional visual system

The page uses warm paper, institutional ink, FundWorkspace blue, and verification green with CSS variables local to the landing root. Display copy uses the existing available serif stack and operational text uses the application's sans-serif stack. Layout relies on grid lines, editorial whitespace, and asymmetry; gradients, glow, glass surfaces, animated particles, and repeated equal rounded cards are excluded. Rounded corners are limited to product surfaces and controls.

Motion only explains causality or interaction, uses short CSS transitions, and is removed under `prefers-reduced-motion`. The content remains readable and navigable without animation.

### Keep the platform content independent of private product services

Apart from existing request Host, auth, and tenant resolution in the public layout and route, platform content is localized copy plus bundled images. It does not fetch GitHub stars, Fund records, feeds, expert profiles, or analytics data. The route remains request-aware and MUST NOT be forced into static generation; the goal is service independence rather than build-time rendering. This reduces hydration, prevents private-data leakage, and avoids making marketing availability depend on product services.

## Risks / Trade-offs

- **Real screenshots can become stale** → Keep assets in a dedicated `public/landing/` directory, document their source flow, and use focused crops so minor navigation changes do not invalidate every image.
- **The serif/editorial system may reduce dense-data legibility** → Restrict serif type to display headings; UI labels, controls, captions, and screenshot annotations remain sans-serif.
- **A workspace redirect can be mistaken for a directory** → Perform syntax-only validation, never query Fund existence, and use identical messaging for all invalid input.
- **A missing demo setting can weaken conversion** → Hide only the demo CTA while keeping the existing-workspace action and final product narrative intact; verification covers configured and unconfigured states.
- **Special-casing `/` in the public layout can regress auth or tenant rendering** → Add contract tests for platform root, tenant root, other public paths, and authenticated redirect behavior; run both origins in the browser.
- **Large screenshots can hurt performance** → Use Next Image with explicit dimensions/sizes, optimized PNG/WebP assets, and lazy loading below the fold.

## Migration Plan

1. Add the OpenSpec contract and focused tests before replacing the platform branch.
2. Add the configuration and workspace-entry helpers with unit coverage.
3. Add the dedicated platform shell and landing components while leaving tenant rendering untouched.
4. Add verified screenshot assets and localized copy.
5. Run fast/targeted/full verification, then exercise platform and tenant hosts through the real browser entrypoint.
6. Deploy with `FUND_WORKSPACE_DEMO_URL` configured to the chosen HTTPS scheduling URL. If omitted, the page remains valid without a demo button.

Rollback removes the platform-only shell/components and restores the previous platform branch. No database or persistent-data rollback is required.

## Open Questions

None. The user approved the narrative, visual direction, real-screenshot treatment, CTA hierarchy, workspace-entry behavior, and external demo-link approach.
