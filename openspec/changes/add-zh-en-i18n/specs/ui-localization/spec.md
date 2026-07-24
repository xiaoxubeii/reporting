## ADDED Requirements

### Requirement: Supported locale resolution
The system SHALL resolve every localized web request to exactly one supported locale from `en` and `zh-CN`. It SHALL prefer a valid persisted browser choice, then a compatible browser language preference, and SHALL otherwise use `en`.

#### Scenario: Persisted Simplified Chinese preference
- **WHEN** a request contains the supported persisted locale `zh-CN`
- **THEN** the request locale is `zh-CN`

#### Scenario: Compatible browser preference on first visit
- **WHEN** no locale is persisted and the browser preference selects a Simplified Chinese language tag
- **THEN** the request locale is `zh-CN`

#### Scenario: Invalid locale input
- **WHEN** a locale cookie or browser language contains an unsupported or malformed value
- **THEN** the value is not used as an import path and the request safely resolves to a supported locale

### Requirement: Route-preserving language switch
The system SHALL let a user select English or Simplified Chinese without adding a locale segment to the URL or changing existing route, authorization, or business state.

#### Scenario: Switch language on a dynamic route
- **WHEN** a user switches language while viewing a route with dynamic parameters and a query string
- **THEN** the localized UI refreshes on the same pathname and query string without signing the user out

#### Scenario: Persist selection in the browser
- **WHEN** a user selects a supported locale and later reloads or opens another application page in the same browser
- **THEN** the selected locale remains active

### Requirement: Localized server and client rendering
The system SHALL provide the same active locale and catalog to localized Server Components and Client Components, and SHALL set the HTML document language to the active locale.

#### Scenario: Simplified Chinese document render
- **WHEN** the active locale is `zh-CN`
- **THEN** the document has `lang="zh-CN"` and localized Server and Client Component copy renders from the Chinese catalog

#### Scenario: English document render
- **WHEN** the active locale is `en`
- **THEN** the document has `lang="en"` and localized copy renders from the English catalog

### Requirement: Catalog integrity
The English and Simplified Chinese catalogs SHALL expose the same semantic message keys for every localized surface included in the change.

#### Scenario: Catalog parity check
- **WHEN** automated verification compares the flattened English and Simplified Chinese catalog keys
- **THEN** verification fails if either catalog has a missing or extra key

### Requirement: Initial localized surface
The system SHALL localize the root document metadata and language selector, authenticated navigation and theme controls, public and portal chrome, and authentication entry points in both supported locales.

#### Scenario: Navigate shared product chrome in Chinese
- **WHEN** an authenticated user selects Simplified Chinese
- **THEN** the shared navigation, theme control, and language control render Chinese labels while their hrefs, access rules, and feature identifiers remain unchanged

#### Scenario: Enter through authentication in Chinese
- **WHEN** an unauthenticated user selects Simplified Chinese on an authentication entry point
- **THEN** the authentication chrome and localized form copy render in Simplified Chinese

### Requirement: Localized product pages
The system SHALL localize every product-authored heading, description, control label, placeholder, status, validation message, and result summary on every user-visible page. Each page and its page-level component graph SHALL migrate as a complete semantic namespace so its Chinese rendering does not intentionally mix English product UI with Chinese shared chrome.

#### Scenario: Use the Import workflow in Chinese
- **WHEN** an authenticated user selects Simplified Chinese and visits the Import page
- **THEN** the page metadata, document upload, company metrics, investment data, fund cash flow sections, actions, statuses, and result summaries render in Simplified Chinese
- **AND** filenames, company names, pasted source data, and backend-provided issue details remain unchanged

#### Scenario: Navigate authenticated business pages in Chinese
- **WHEN** an authenticated user selects Simplified Chinese and follows any reachable application destination
- **THEN** the destination's product-authored page content renders in Simplified Chinese while its pathname, authorization checks, business values, and feature behavior remain unchanged

#### Scenario: Navigate public and legal pages in Chinese
- **WHEN** a visitor selects Simplified Chinese and visits a public marketing, explainer, pricing, contact, license, privacy, or terms page
- **THEN** all product-authored page content and metadata render in Simplified Chinese without changing the route

#### Scenario: Complete setup or token entry in Chinese
- **WHEN** a user visits a setup, onboarding, submission, expert-response, or other token-based user interface with Simplified Chinese active
- **THEN** its instructions, fields, actions, validation, and statuses render in Simplified Chinese while token and authentication behavior remain unchanged

#### Scenario: Use the LP portal in Chinese
- **WHEN** an LP portal user selects Simplified Chinese and navigates between portal destinations
- **THEN** the complete portal page content and page-level controls render in Simplified Chinese while investor data and permissions remain unchanged

#### Scenario: Full route inventory remains covered
- **WHEN** a user-visible page is added or renamed under the application router
- **THEN** automated localization coverage fails until the route is assigned a semantic namespace or explicitly classified as a non-visual redirect/transport route

### Requirement: Business-data boundaries
The system MUST NOT translate identifiers, routes, API enums, permission keys, company or fund names, or user-authored content as a side effect of changing the UI locale. Locale-aware number or date presentation MUST NOT change the fund's configured currency.

#### Scenario: Change locale with fund data visible
- **WHEN** a user changes from English to Simplified Chinese while business data is displayed
- **THEN** human-readable UI chrome changes language while stored business values and configured currency remain unchanged

### Requirement: Accessible responsive selector
The language selector SHALL be keyboard operable, expose an accessible name and current selection, retain a visible focus indicator, and remain usable in expanded, collapsed, desktop, and mobile navigation states.

#### Scenario: Keyboard language selection
- **WHEN** a keyboard or assistive-technology user focuses and activates the language selector
- **THEN** both supported choices and the current selection are communicated and the chosen locale is applied

### Requirement: Analyst response language
The interactive Analyst SHALL answer in the language of the latest user message. It SHALL use the validated active UI locale only when the latest message is language-neutral or otherwise ambiguous, and SHALL NOT infer the response language from injected deal, company, portfolio, or document context.

#### Scenario: Chinese question over English deal context
- **WHEN** the active deal context is English and the latest user message is in Simplified Chinese
- **THEN** the Analyst answers in Simplified Chinese

#### Scenario: English question in a Chinese interface
- **WHEN** the active UI locale is `zh-CN` and the latest user message is in English
- **THEN** the Analyst answers in English

#### Scenario: Language-neutral follow-up
- **WHEN** the latest user message does not provide a reliable language signal
- **THEN** the Analyst answers in the validated active UI locale
