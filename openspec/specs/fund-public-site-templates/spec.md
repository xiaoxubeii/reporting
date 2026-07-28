# fund-public-site-templates Specification

## Purpose
TBD - created by archiving change add-fund-public-site-templates. Update Purpose after archive.
## Requirements
### Requirement: Platform and Fund homepages have distinct purposes
The system SHALL keep the platform root `/` as the Hemrock/FundWorkspace product-marketing site and SHALL render only Fund-facing content at a tenant hostname's `/` path. Existing tenant `/auth`, GP application, and LP Portal paths MUST remain unchanged.

#### Scenario: Platform root remains the product site
- **WHEN** a visitor opens the configured platform root hostname
- **THEN** the system renders the existing Hemrock/FundWorkspace marketing homepage without injecting any Fund's public-site content

#### Scenario: Published tenant root renders the Fund site
- **WHEN** a visitor opens `/` on a valid tenant hostname with a published public site
- **THEN** the system renders that Fund's published template and content without Hemrock product workflow, product pricing, software screenshots, or founder-biography sections

#### Scenario: Tenant product paths remain unchanged
- **WHEN** a user opens `/auth`, a GP product path, or `/portal` on a tenant hostname
- **THEN** the system applies the existing matching-Fund authentication and authorization behavior

### Requirement: Fund public sites use built-in templates
The system SHALL provide exactly the built-in `focus`, `institutional`, and `minimal` template keys for the initial release. All templates MUST consume the same versioned structured content contract, and changing the draft template MUST NOT discard or rewrite draft content.

#### Scenario: Administrator changes template without losing content
- **WHEN** a Fund administrator changes a draft from one supported template to another
- **THEN** all previously saved shared content remains available and only the presentation changes

#### Scenario: Unsupported template is rejected
- **WHEN** a client submits any template key outside the supported set
- **THEN** the API rejects the request without changing draft or published state

#### Scenario: Empty optional sections collapse cleanly
- **WHEN** a selected template receives no published team or portfolio entries
- **THEN** it omits those sections without empty headings, placeholder private data, or broken layout

### Requirement: Public-site content is structured and bilingual
The system SHALL store a versioned structured content document with a default locale, English and Simplified Chinese localized copy, investment focus, explicit team and portfolio entries, contact details, CTA configuration, section visibility, and SEO metadata. User-supplied text and URLs MUST be bounded and validated; arbitrary HTML, JavaScript, CSS, and unknown fields MUST be rejected.

#### Scenario: Requested locale is available
- **WHEN** the visitor's resolved UI locale has published localized content
- **THEN** the template renders that locale's copy

#### Scenario: Requested locale is unavailable
- **WHEN** the visitor's resolved UI locale is missing or incomplete
- **THEN** the template falls back to the site's declared default locale without exposing draft content

#### Scenario: Unsafe structured input is rejected
- **WHEN** an administrator submits executable markup, unsafe URL schemes, excessive arrays, overlong fields, or unknown schema properties
- **THEN** the API returns a validation error and persists no part of the invalid update

### Requirement: Draft and published states are separate
The system SHALL maintain editable draft template/content separately from the anonymous published template/content. Saving a draft MUST NOT alter the current public snapshot. Publishing MUST atomically copy the complete validated draft into a versioned published snapshot, and unpublishing MUST make the tenant homepage non-public while preserving the draft.

#### Scenario: Saving does not change the live site
- **WHEN** an administrator saves draft edits after a version is already published
- **THEN** anonymous visitors continue to receive the previous complete published version

#### Scenario: Publishing creates one coherent snapshot
- **WHEN** an administrator publishes a valid draft
- **THEN** the template key and entire content document become visible together under one incremented published version

#### Scenario: Unpublishing removes anonymous content
- **WHEN** an administrator unpublishes the Fund site
- **THEN** the anonymous resolver returns no public-site payload and the tenant `/` route presents a branded sign-in-oriented private state rather than platform marketing content

### Requirement: Only Fund administrators can author and publish
The system SHALL require an authenticated administrator membership in the Host Fund for reading or changing drafts, previewing, publishing, and unpublishing. Requests from a sibling Fund host, a non-admin member, an LP-only identity, or an unauthenticated caller MUST fail closed.

#### Scenario: Matching administrator edits draft
- **WHEN** an administrator uses `Settings → Public Site` on their matching tenant hostname
- **THEN** they can load and save only that Fund's draft

#### Scenario: Cross-Fund authoring is denied
- **WHEN** a Fund A administrator sends a draft or publish request through Fund B's hostname or with Fund B identifiers
- **THEN** the system returns a uniform denial and neither Fund's row changes

#### Scenario: Preview is private
- **WHEN** a non-admin or anonymous visitor opens the draft preview route
- **THEN** the system denies access and never substitutes published content as if it were the draft

### Requirement: Anonymous resolution exposes only explicit published data
The system SHALL resolve a public Fund site by the trusted exact tenant slug through a least-privilege database function or equivalent boundary. The anonymous result MUST contain only public branding, published template/content, published version, and publication timestamp, and MUST never include `fund_settings` credentials, draft content, private Fund data, or caller-supplied Fund identifiers.

#### Scenario: Exact published Fund resolves
- **WHEN** an anonymous request uses a valid published Fund hostname
- **THEN** it receives exactly that Fund's allowlisted published site payload

#### Scenario: Unknown or unpublished Fund does not leak
- **WHEN** an anonymous request uses an unknown slug or a Fund without a published site
- **THEN** it receives no public-site payload and cannot distinguish drafts, prior published snapshots, or private data

#### Scenario: Private workspace data is never inferred
- **WHEN** a Fund has private companies, Deals, LPs, performance, or team/member records not explicitly copied into published structured content
- **THEN** none of those records appear on the public site

### Requirement: Settings provides a template publishing workflow
The system SHALL provide an administrator-only `Settings → Public Site` experience with template cards, structured content editing, desktop/mobile preview, save state, explicit publish, and unpublish controls. The interface MUST show whether the draft differs from the published version and MUST not represent an autosaved draft as live.

#### Scenario: Administrator previews a draft
- **WHEN** an administrator selects a template or changes content and opens preview
- **THEN** the preview renders the current saved draft under the matching Fund branding without making it anonymous

#### Scenario: Administrator publishes intentionally
- **WHEN** an administrator confirms the publish action for a valid draft
- **THEN** the interface reports the new live version and the tenant homepage renders it

#### Scenario: Mobile and desktop templates remain usable
- **WHEN** a visitor views any built-in template at supported mobile or desktop viewport widths
- **THEN** navigation, copy, images, CTA controls, login links, and optional sections remain readable and usable without horizontal overflow

### Requirement: Public assets and outbound links are safe
The system SHALL accept only validated image data or Fund-owned public asset URLs according to the existing deployment's asset policy, and SHALL validate external/contact links against an allowlist of safe schemes. Public pages MUST not execute administrator-provided markup and MUST include safe link attributes for external destinations.

#### Scenario: Unsafe URL is rejected
- **WHEN** draft content includes `javascript:`, credential-bearing, protocol-relative, or otherwise disallowed URLs
- **THEN** the API rejects the draft without changing stored state

#### Scenario: External link is rendered safely
- **WHEN** a published CTA, team, portfolio, or social URL points to an allowed external HTTPS destination
- **THEN** the page renders it with appropriate external-link protections

### Requirement: Publication is cache-correct and reversible
The system SHALL key anonymous public-site caching by trusted Fund slug and published version, SHALL make a successful publish or unpublish visible within the documented cache window, and SHALL support migration rollback without losing the pre-existing Fund hostname, authentication, Dashboard, or LP Portal behavior.

#### Scenario: Publish replaces cached content
- **WHEN** version N is published after version N-1
- **THEN** anonymous requests stop receiving version N-1 within the configured cache window and never receive a mix of both versions

#### Scenario: Feature migration rolls back
- **WHEN** operators roll back the public-site feature while retaining Fund subdomain isolation
- **THEN** tenant authentication and protected product routes continue operating and tenant `/` falls back to the branded private state
