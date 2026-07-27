# Simplified FundWorkspace Platform Landing Design

## Purpose

Simplify the platform landing page so a fund founder or managing partner can understand FundWorkspace quickly and take one of two equally important actions:

1. Request a product demo as a prospective customer.
2. Enter an existing FundWorkspace as a current customer.

The page should position FundWorkspace as one workspace spanning the fund's investment and operating workflow, while preserving expert validation as a prominent trust mechanism.

## Audience and Message

Primary audience: fund founders and managing partners.

Primary message:

> One workspace for the fund's investment and operating workflow.

Supporting message:

FundWorkspace connects opportunity discovery, AI research, expert validation, investment committee decisions, portfolio management, fund operations, and LP collaboration in one system.

## Scope

The redesign is limited to the hosted FundWorkspace platform landing page. Existing tenant public sites, tenant authentication, GP application pages, LP Portal pages, workspace address parsing, and platform-versus-tenant host routing remain unchanged.

The page remains static and localized. It does not introduce new APIs, Fund data access, customer claims, usage metrics, or third-party integrations.

## Information Architecture

The page contains five compact sections, occupying approximately four to five desktop viewports.

### 1. Navigation and Hero

Navigation contains only:

- FundWorkspace wordmark
- Product
- Workflow
- Expert validation
- Request demo
- Enter workspace

Remove the second floating navigation that appears after scrolling.

The Hero contains:

- Headline: "One workspace for the fund's investment and operating workflow."
- One concise supporting paragraph.
- Two equally prominent, equally sized actions: "Request demo" and "Enter workspace."
- One verified, non-sensitive product screenshot with no more than three explanatory labels.

Remove the current grid of approximately twenty product surfaces from the top of the page.

### 2. Management Outcomes

Replace feature cards with three management outcomes:

1. See the whole picture: opportunities, research, deals, and portfolio companies share one information environment.
2. Form decisions: evidence, expert views, and investment committee judgment preserve their context.
3. Drive execution: investment decisions continue into portfolio work, fund operations, and LP communication.

Each outcome uses a short heading and one sentence. This section does not contain a card matrix or a separate screenshot for every capability.

### 3. Connected Workflow

Show one continuous workflow:

> Market signals -> AI Research -> Expert validation when needed -> IC decision -> Portfolio and LP

Only one corresponding product view is visible at a time. Desktop may use a horizontal step selector; mobile uses a vertical or horizontally scrollable selector. The interaction must remain understandable without animation or JavaScript-enhanced transitions.

Expert validation is important and visible, but the copy must not imply that every Research run requires an expert.

### 4. Trusted Decision Making

Combine the existing expert-validation, trust, security, and auditability material into one section.

The section explains two distinct sources of confidence:

- Human confidence: qualified industry experts can validate critical assumptions when required.
- System confidence: sources, analysis, decisions, and follow-up actions remain traceable in the workspace.

Do not publish invented customer logos, performance metrics, testimonials, or security certifications.

### 5. Closing Conversion

End with the same two actions shown in the Hero:

- Request demo
- Enter workspace

The section contains one short sentence and no additional feature summary.

## Visual Direction

- Preserve the restrained, editorial visual language inspired by Harmonic without reproducing its page structure verbatim.
- Use whitespace, typography, dividers, and a limited blue-green accent palette instead of gradients, glowing effects, oversized card grids, or decorative AI imagery.
- Use the compact transparent FundWorkspace icon variants already produced for 24 px, 26 px, and 32 px display sizes with matching 2x assets.
- Prefer one strong real product image per narrative moment. Avoid simultaneous screenshot stacks.
- Keep section backgrounds mostly neutral and use contrast changes sparingly to signal narrative transitions.

## Interaction and Conversion

- "Request demo" appears only when the existing validated absolute HTTPS demo URL is configured.
- "Enter workspace" continues to use the existing workspace-entry behavior and validation.
- Both actions receive equal placement and dimensions. Styling may distinguish their purpose, but neither is visually demoted to a text link.
- Navigation anchors scroll to Product, Workflow, and Expert validation.
- The page must remain fully usable with reduced motion enabled.

## Responsive and Accessibility Requirements

- Support 320 px width, mobile and desktop layouts, 200% zoom, keyboard navigation, visible focus, and reduced motion.
- Preserve semantic headings and section landmarks.
- Product screenshots require useful alternative text; purely decorative labels remain hidden from assistive technology.
- Workflow selection must expose the active step programmatically and remain operable from the keyboard.
- Chinese and English must preserve the same information hierarchy without forcing identical line breaks.

## Removed or Consolidated Content

Remove:

- The twenty-item connected-surfaces grid.
- The duplicate floating navigation.
- Repeated capability descriptions that restate the same workflow.
- Separate trust, security, expert, and audit sections when their content can be expressed once.
- Decorative animations that do not communicate product behavior.

Consolidate:

- Discover, Research, and Act capability sections into the continuous workflow.
- Expert validation and system trust into Trusted Decision Making.
- Repeated bottom-of-section actions into the Hero and final conversion section.

## Architecture Boundaries

- Keep trusted Host classification and platform/tenant routing unchanged.
- Keep static localized content in `components/platform-landing/` and message catalogs.
- Keep pure configuration and workspace-address parsing in `lib/platform-landing/`.
- Reuse existing `ExistingWorkspace`, demo URL validation, and real product evidence assets.
- Do not add a backend dependency or client-side data request for the landing page.

## Verification

Implementation is complete only after:

- Focused component and contract tests cover the five-section structure, removed surfaces grid, CTA behavior, localization, and platform/tenant isolation.
- Changed-scope lint and type checks pass.
- Production build passes or unrelated existing failures are documented precisely.
- Real Chromium verifies desktop and mobile in Chinese and English.
- Browser verification checks both CTA paths, keyboard navigation, reduced motion, console errors, failed network requests, and final layout screenshots.
- Tenant public pages, tenant authentication, GP application pages, LP Portal pages, and other public routes retain their existing behavior.

## Success Criteria

A first-time managing partner should be able to answer these questions after the Hero and the next section:

1. What is FundWorkspace? One workspace for investment and fund operations.
2. What changes for the fund? The team sees context, makes traceable decisions, and carries them into execution.
3. Why trust it? AI research can be checked by experts when needed, and the decision trail remains auditable.
4. What should I do next? Request a demo or enter my existing workspace.
