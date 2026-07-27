## Why

The current platform homepage presents a long generic feature tour whose rounded cards, repeated steps, and abstract AI messaging do not communicate a distinctive institutional product. FundWorkspace now spans discovery, research, expert validation, investment decisions, portfolio operations, and LP workflows, so the platform root needs a focused landing experience that explains this continuous workflow without changing any Fund tenant surface.

## What Changes

- Replace the platform-root homepage with an editorial, Harmonic-inspired FundWorkspace landing page whose primary promise is moving from market signal to investment decision.
- Present `AI Research + industry expert validation` as the product's principal differentiator, while making clear that expert validation enters Research only when a material gap or contradiction requires it.
- Use real FundWorkspace product screenshots as evidence; marketing layout may crop, mask, frame, and annotate them but MUST NOT invent product states, customers, performance claims, or usage metrics.
- Organize the page around one continuous workflow: Discover, Research, Expert Validation, IC Decision, and Portfolio & LP operations.
- Add a configurable external demo CTA and a non-enumerating existing-workspace entry that redirects a user-supplied Fund slug or canonical address to that tenant's `/auth` origin.
- Keep tenant-hosted Fund public sites, tenant `/auth`, GP workspace, and LP Portal behavior unchanged.
- Provide complete English and Simplified Chinese copy, responsive layouts, keyboard access, reduced-motion behavior, and safe external-link handling.

## Capabilities

### New Capabilities

- `institutional-platform-landing`: Covers the FundWorkspace platform-root narrative, visual and evidence rules, localized responsive sections, demo CTA configuration, safe workspace redirect, and strict separation from tenant-hosted Fund experiences.

### Modified Capabilities

None.

## Impact

- Replaces the platform branch of `app/(public)/page.tsx` and introduces focused landing components and pure CTA/workspace-entry helpers.
- Adds English and Simplified Chinese `PublicHome` copy and landing-specific tests.
- Adds curated real-product screenshot assets captured from non-sensitive local fixtures or existing verified evidence.
- Reads a new optional server-side demo URL environment setting; no new database table, API route, analytics dependency, or private Fund-data read is introduced.
- Retains the existing tenant resolution, published Fund-site renderer, authentication routes, middleware boundaries, and legacy self-host behavior.
