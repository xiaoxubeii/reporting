## Why

Fund tenant hostnames currently reuse the Hemrock/FundWorkspace product-marketing homepage, so a visitor to `<fund>.fundworkspace.com` learns about the software instead of the Fund. Fund administrators need a safe, consistent way to publish a Fund-facing website without building arbitrary pages or exposing private workspace data.

## What Changes

- Keep the platform root homepage as the Hemrock/FundWorkspace product site while rendering a Fund-facing public website at each published tenant hostname's existing `/` path.
- Add three built-in responsive templates—Focus, Institutional, and Minimal—that share one structured content model; switching templates changes presentation without discarding content.
- Add `Settings → Public Site` for administrators to select a template, edit bilingual structured content, preview the draft, publish it, or unpublish it.
- Separate draft content from the anonymous published snapshot so edits never become public before an explicit publish action.
- Allow only explicitly curated Fund profile, strategy, team, portfolio, CTA, contact, SEO, and legal content to cross the anonymous boundary.
- Preserve the existing tenant `/auth`, Dashboard, and `/portal` paths and Fund/Host isolation rules.

## Capabilities

### New Capabilities

- `fund-public-site-templates`: Structured Fund public-site authoring, template selection, draft preview, explicit publishing, anonymous tenant rendering, bilingual content, and cross-Fund safety.

### Modified Capabilities

None.

## Impact

- Adds a Fund-scoped public-site persistence contract, migration, generated database types, authenticated Settings APIs, and a least-privilege anonymous resolver.
- Adds a new Settings surface and three tenant-only public landing renderers while retaining the existing platform marketing renderer.
- Extends tenant descriptor/cache invalidation and public asset handling without exposing `fund_settings` secrets or automatically publishing private portfolio/workspace records.
- Requires focused migration/RLS/API/render tests plus real desktop/mobile browser verification for draft, preview, publish, unpublish, template switching, language fallback, and cross-Fund isolation.
