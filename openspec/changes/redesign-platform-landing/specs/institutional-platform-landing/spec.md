## ADDED Requirements

### Requirement: Platform and Fund homepages remain origin-specific
The system SHALL render the institutional FundWorkspace marketing landing only for the unauthenticated platform hostname's `/` route. A valid tenant hostname's `/` route MUST continue to render only that Fund's published public site or uniform private state, and tenant `/auth`, GP workspace, and `/portal` behavior MUST remain unchanged.

#### Scenario: Platform visitor opens the root
- **WHEN** an unauthenticated visitor opens `/` on the configured platform hostname
- **THEN** the system renders the institutional FundWorkspace landing without reading or presenting any Fund-private data

#### Scenario: Fund visitor opens the tenant root
- **WHEN** a visitor opens `/` on a valid Fund tenant hostname
- **THEN** the system renders that Fund's existing public-site state and does not render the platform marketing landing

#### Scenario: Visitor opens another public platform page
- **WHEN** an unauthenticated visitor opens a public explainer, pricing, legal, or contact route
- **THEN** the system retains the existing public-page chrome and route behavior

#### Scenario: Legacy self-host visitor opens the root
- **WHEN** hosted Fund isolation is not configured and an unauthenticated visitor opens `/`
- **THEN** the system retains the existing legacy self-host homepage and public chrome instead of inferring hosted platform mode from a missing tenant

### Requirement: Landing communicates one evidence-led investment workflow
The platform landing SHALL present FundWorkspace as the institutional workspace that moves from market signal to investment decision. It MUST present the ordered workflow Discover, AI Research, Industry Expert Validation when required, IC Decision, and Portfolio & LP operations, and MUST describe expert validation as a response to material evidence gaps or contradictions rather than a mandatory step for every Research run.

#### Scenario: Visitor scans the primary narrative
- **WHEN** a visitor reads the hero and workflow sections
- **THEN** the visitor can identify the complete investment-decision workflow and the role of optional industry-expert validation without interpreting FundWorkspace as only a startup database or relationship CRM

#### Scenario: Visitor reviews product capability groups
- **WHEN** a visitor reaches the product-capability section
- **THEN** the system groups capabilities under Discovery, Diligence, Decision, and Portfolio & LP rather than presenting an unstructured feature inventory

### Requirement: Product evidence uses real FundWorkspace states
The landing MUST use screenshots captured from verified non-sensitive FundWorkspace product states. The system MAY crop, mask, frame, resize, and annotate those screenshots, but MUST NOT invent product screens, customer identities, performance outcomes, usage metrics, or expert-verification results that did not exist in the captured state.

#### Scenario: Product screenshot is displayed
- **WHEN** the landing presents Research, expert-validation, Deal, or portfolio product evidence
- **THEN** the visual is traceable to a real verified FundWorkspace screen and explanatory overlays remain visually distinct from the captured product

#### Scenario: Assistive technology reaches product evidence
- **WHEN** a screen-reader user reaches an informative screenshot
- **THEN** the image exposes localized alternative text describing the relevant product state while decorative framing remains hidden

### Requirement: Institutional visual system avoids generic AI decoration
The landing SHALL use the approved warm-paper, institutional-ink, FundWorkspace-blue, and verification-green roles; editorial display typography; operational sans-serif UI typography; grid-based spacing; and restrained product-surface rounding. It MUST NOT use decorative gradients, glow, glassmorphism, animated particles, or repeated equal-card layouts as the primary page structure.

#### Scenario: Landing renders at a desktop viewport
- **WHEN** the landing is displayed at 1280 CSS pixels or wider
- **THEN** it uses an asymmetrical editorial grid and full-width platform shell without the generic public sidebar

#### Scenario: User requests reduced motion
- **WHEN** the browser reports `prefers-reduced-motion: reduce`
- **THEN** all non-essential landing transitions and motion are removed without hiding content or state

### Requirement: Landing is localized, responsive, and keyboard accessible
The system SHALL provide complete English and Simplified Chinese landing copy through the existing locale mechanism. All content and actions MUST remain usable at 320 CSS pixels, at desktop widths, with 200% text zoom, and by keyboard without horizontal page overflow or keyboard traps.

#### Scenario: Visitor switches language
- **WHEN** the visitor changes between English and Simplified Chinese on the platform landing
- **THEN** headings, workflow labels, screenshot descriptions, form labels, errors, and CTA copy update on the same URL and the document language remains correct

#### Scenario: Visitor uses a narrow viewport
- **WHEN** the landing renders at 320 CSS pixels wide
- **THEN** the navigation, screenshots, workflow, expert section, trust section, and CTAs stack into a readable order without clipped actions or horizontal page scrolling

#### Scenario: Visitor uses the keyboard
- **WHEN** the visitor tabs through the platform landing
- **THEN** every interactive element receives a visible focus state in logical document order and dialogs return focus to their trigger when closed

### Requirement: Demo CTA is configuration-backed and safe
The system SHALL read the optional server-side `FUND_WORKSPACE_DEMO_URL` setting and render demo actions only when it is a valid absolute HTTPS URL without credentials. Demo actions MUST open the configured URL in a new browsing context with opener access disabled. Missing or invalid hosted configuration MUST produce one bounded process-local operator warning and MUST NOT render a broken or misleading action.

#### Scenario: Valid demo URL is configured
- **WHEN** `FUND_WORKSPACE_DEMO_URL` contains an absolute HTTPS URL
- **THEN** every visible demo CTA opens that exact URL with `noopener noreferrer`

#### Scenario: Demo URL is absent or invalid
- **WHEN** `FUND_WORKSPACE_DEMO_URL` is missing, non-HTTPS, relative, or malformed
- **THEN** the landing omits demo actions, emits at most one process-local operator warning, and remains fully usable through the existing-workspace path

### Requirement: Existing-workspace entry redirects without enumeration
When hosted Fund isolation is configured, the platform landing SHALL provide an existing-workspace entry that accepts either one valid Fund slug or that Fund's canonical hostname/address. The system MUST perform syntax-only validation, reject reserved or foreign authorities and ambiguous values, MUST NOT query Fund existence or membership, and SHALL navigate a valid input to the canonical tenant `/auth` URL.

#### Scenario: Visitor enters a valid Fund slug
- **WHEN** the visitor enters a syntactically valid, non-reserved Fund slug and submits
- **THEN** the browser navigates to that slug's canonical tenant `/auth` URL without first querying Fund existence

#### Scenario: Visitor enters the canonical tenant address
- **WHEN** the visitor enters a canonical tenant hostname or `/auth` address under the configured platform root
- **THEN** the browser navigates to the same canonical tenant `/auth` URL

#### Scenario: Visitor enters an invalid or foreign value
- **WHEN** the visitor enters a reserved label, foreign hostname, credentials, punycode, query, fragment, ambiguous subdomain, malformed value, or unsupported path
- **THEN** the system stays on the platform landing and displays one localized generic validation error without revealing whether any Fund exists

#### Scenario: Hosted isolation is not configured
- **WHEN** the platform runs in legacy self-host mode without a canonical workspace root
- **THEN** the landing omits the cross-tenant workspace-entry action and preserves the existing self-host authentication path

### Requirement: Platform landing has no private runtime dependency
The institutional platform landing MUST render from localized static content, validated public configuration, and bundled public assets. It MUST NOT fetch Fund records, feed discovery, Research, expert profiles, GitHub metrics, or other product-service data to complete its anonymous render.

#### Scenario: Product services are unavailable
- **WHEN** Fund product APIs, feed services, expert services, or external metrics are unavailable
- **THEN** the platform landing still renders its complete narrative and all configuration-valid actions

### Requirement: Platform landing uses a compact executive narrative
The platform landing MUST present one five-section narrative for fund founders and managing partners: Hero, Management Outcomes, Connected Workflow, Trusted Decision Making, and Closing Conversion.

#### Scenario: Visitor scans the page
- **WHEN** a visitor opens the hosted platform root
- **THEN** the page presents the five sections in narrative order
- **AND** the page does not render the connected-surfaces grid or a second floating navigation

#### Scenario: Visitor chooses a next step
- **WHEN** a safe demo URL is configured
- **THEN** Request demo and Enter workspace are presented as equally prominent actions in the Hero and closing section
- **WHEN** the demo URL is absent
- **THEN** Enter workspace remains available without an empty demo-action placeholder

#### Scenario: Visitor reviews the workflow
- **WHEN** the visitor operates the workflow selector with pointer or keyboard
- **THEN** five stages are available and only one verified product view is exposed at a time
- **AND** expert validation is described as needs-based
