## Context

Fund subdomain isolation already resolves an exact tenant slug from the request host and keeps `/auth`, the GP workspace, and `/portal` scoped to that Fund. The public route group still renders the FundWorkspace product-marketing homepage and product sidebar on every hostname. Fund administrators need a public-facing Fund site, but a free-form builder would add unsafe markup, difficult migrations, and an unbounded authoring surface.

The existing tenant descriptor is intentionally small and cached because middleware and root layout code resolve it on many requests. Public-site drafts are larger, change independently, and must never be exposed through that descriptor. Existing `fund_settings` also contains private operational configuration and is not a suitable anonymous publication boundary.

## Goals / Non-Goals

**Goals:**

- Keep the platform hostname's existing product-marketing experience while making a tenant hostname's `/` a Fund-owned public site.
- Offer three responsive built-in presentations over one versioned, bilingual, structured content contract.
- Keep authoring private and Fund-scoped, with explicit save, preview, publish, and unpublish operations.
- Publish one coherent immutable snapshot and expose only that allowlisted snapshot to anonymous visitors.
- Preserve current authentication, workspace, Dashboard, and LP Portal paths and behavior.

**Non-Goals:**

- A drag-and-drop builder, arbitrary blocks, custom HTML, JavaScript, CSS, or user-uploaded executable content.
- Automatically publishing Deals, companies, LPs, performance, users, or any other workspace records.
- Custom domains, per-page routing, analytics configuration, or an asset-management system in the initial release.
- Translating administrator-authored content automatically.

## Decisions

### Store public-site state separately from tenant descriptors and Fund settings

Add one `fund_public_sites` row per Fund. It stores the draft template/content/revision and a separate published template/content/version/revision/timestamp. The published columns are a snapshot copied from the draft by an atomic database function; later draft saves cannot change the live snapshot. Unpublishing clears public visibility but preserves both the draft and last published snapshot for a reversible workflow.

This is preferred over adding JSON to `funds` or `fund_settings`: it keeps large editable content out of frequently resolved tenant descriptors and prevents an anonymous policy from ever touching the private settings table.

### Use one strict, versioned content contract for every template

The application owns a JSON Schema and TypeScript model with `additionalProperties: false`, bounded text/arrays, safe HTTPS or mail-address fields, a default locale, localized English and Simplified Chinese copy, focus data, explicit team/portfolio entries, CTA settings, visibility flags, and SEO copy. The three template keys are exactly `focus`, `institutional`, and `minimal`.

All templates receive the same normalized render model. Switching a template changes only `draft_template_key`; it never transforms or drops content. Missing optional sections collapse. React renders user text as text, never through `dangerouslySetInnerHTML`.

This shared contract is preferred over per-template content because template changes remain lossless and validation/auditing has one boundary.

### Derive authoring scope from the authenticated session and trusted host

Authenticated settings routes resolve the trusted tenant slug from the host, load the caller's active membership, and require administrator role in that exact Fund. Request bodies never accept `fund_id`. Draft read/save, preview, publish, and unpublish use this same guard.

Service-role database access is limited to these server routes. RLS denies direct anonymous and ordinary authenticated table access. This is preferred over client-side Supabase writes because the server can enforce Host-to-Fund binding uniformly and avoid confused-deputy identifiers.

### Expose anonymous content through one least-privilege resolver

A `SECURITY DEFINER` RPC accepts an exact normalized slug and returns only Fund id/slug/name/logo plus published template/content/version/timestamp when the site is currently published. It never returns draft columns or joins private workspace/settings tables. Execution is granted to anonymous/authenticated callers, while direct table reads remain unavailable.

The tenant homepage calls this resolver server-side. Unknown and unpublished Funds render the same branded private/sign-in state so their draft history cannot be inferred.

### Publish and unpublish atomically with optimistic draft revisions

Every valid save increments `draft_revision`. Save accepts the revision last read by the editor and rejects stale writes. Publishing calls one database function that validates the expected draft revision, copies template and content together, records `published_draft_revision`, increments `published_version`, and sets the timestamp. Unpublish is a single update/function that removes visibility without changing the draft.

This avoids mixed snapshots and silent overwrites from concurrent settings tabs. It is preferred over application read-then-write sequences, which cannot guarantee snapshot coherence.

### Branch the existing public shell only for tenant `/`

The root server page distinguishes platform and trusted tenant hosts. Platform requests render the existing FundWorkspace homepage. Tenant requests resolve and render the Fund snapshot or private state. The current client public layout bypasses the product header/sidebar and product analytics only when both a tenant descriptor is present and the pathname is `/`; all existing routes retain their current path behavior.

Tenant pages are dynamically rendered with no cross-request application content cache in the initial release. This is deliberately simpler and stricter than caching mutable draft/public payloads; the database-published version remains available as an ETag/cache key if CDN caching is introduced later. Successful publish/unpublish is therefore visible on the next request.

### Keep preview authenticated and reuse production renderers

`Settings → Public Site` edits a saved draft and links to an authenticated preview route. Preview uses the exact template components and normalized content used by the tenant homepage, adds `noindex`, and never falls back to a published snapshot. Desktop/mobile preview controls change the preview frame width rather than maintaining separate markup.

Reusing production renderers is preferred over an approximate editor-only preview because visual drift would undermine the publishing decision.

### Use explicit locale fallback and safe outbound destinations

Each site declares `en` or `zh-CN` as its default. Every localized field resolves requested locale, then default locale, then the other supported locale; empty fields remain absent. In the first release, images and external CTAs must be absolute HTTPS URLs without embedded credentials; contact email is stored separately and rendered as a generated `mailto:` URL. External links receive `noopener noreferrer`.

This provides predictable bilingual behavior without exposing unsafe schemes or requiring a new storage subsystem.

## Risks / Trade-offs

- **Structured templates may feel less flexible than a builder** → Keep the shared model broad enough for thesis, strategy, team, portfolio, and contact content, and evolve it through schema versions instead of arbitrary markup.
- **JSONB is less queryable than normalized section tables** → Public-site content is read and published as one document; explicit revision and template columns keep operational state queryable.
- **Large images can hurt performance** → Validate HTTPS URLs, use responsive image treatment, and omit empty assets; owned upload/transformation can be added as a separate capability.
- **Concurrent editor tabs can overwrite work** → Require matching draft revision and return a clear conflict so the user reloads before saving.
- **A database definer function can bypass RLS** → Fix the search path, qualify every object, validate slug shape, return an explicit allowlist, and grant only the required functions.
- **Bypassing the public product shell at tenant root changes client layout behavior** → Gate it on both trusted tenant branding and exact `/`, with focused platform/tenant regression and browser tests.

## Migration Plan

1. Add `fund_public_sites`, constraints, RLS, timestamps, and least-privilege resolve/publish/unpublish functions. Do not create public-site rows automatically for existing Funds.
2. Deploy shared validation/render contracts and authenticated admin APIs.
3. Add Settings discovery, editor, preview, and the three templates.
4. Switch tenant `/` to the published resolver or branded private state; retain the current platform homepage and all other tenant paths.
5. Rollback application code first to the private tenant state if necessary. The new table is isolated, so subdomain authentication and product routes remain functional. A later database rollback can drop only the public-site functions/table after content export if operators want to preserve authored drafts.

## Open Questions

No blocking questions remain for the initial release. Custom domains, uploads, analytics, automatic translation, and additional templates require separate product and security decisions.
