## ADDED Requirements

### Requirement: UTC timestamp storage remains unchanged
The system SHALL continue to persist timestamps as UTC instants and SHALL apply timezone conversion only for presentation.

#### Scenario: Existing timestamp is displayed locally
- **WHEN** a stored UTC timestamp is rendered for a user with a resolved non-UTC timezone
- **THEN** the displayed calendar date reflects that timezone without modifying the stored instant

### Requirement: Server and client use one explicit render timezone
The system MUST resolve one valid IANA timezone for each request and MUST provide that exact value to server-side and client-side internationalization formatters.

#### Scenario: Timestamp crosses a local calendar boundary
- **WHEN** a UTC timestamp formats as different dates in UTC and the user's timezone
- **THEN** SSR and hydration produce identical text using the request's resolved timezone

#### Scenario: Timezone state is missing or invalid
- **WHEN** the timezone cookie, profile value, or detected value is absent, malformed, unsupported, or stale
- **THEN** the system renders with UTC and does not fail the page

### Requirement: Browser timezone is detected without physical-location inference
When Automatic mode is active, the client SHALL detect the browser's IANA timezone using the runtime internationalization API and SHALL NOT use IP, GPS, language, or tenant identity as a location proxy.

#### Scenario: First visit has no timezone cookie
- **WHEN** a browser first loads the application without a valid timezone cookie
- **THEN** the initial SSR and hydration use UTC, the valid detected timezone is persisted, and at most one reload applies it consistently

#### Scenario: Detected timezone already matches
- **WHEN** Automatic mode has a cookie whose timezone matches the browser detection
- **THEN** the client performs no redundant cookie write or reload

### Requirement: Automatic timezone is device-specific
The system SHALL store an automatically detected timezone only in a host-scoped device cookie and SHALL NOT persist it as the user's account-wide manual preference.

#### Scenario: Two devices use different automatic timezones
- **WHEN** the same user uses Automatic mode on two devices in different timezones
- **THEN** each device displays dates in its own detected timezone without overwriting the other device

### Requirement: User can set a manual timezone override
An authenticated user SHALL be able to select a valid manual IANA timezone in Personal Settings, and that override SHALL take precedence over automatic detection on every device.

#### Scenario: User selects a manual timezone
- **WHEN** the user saves a valid manual timezone
- **THEN** the profile stores it, the current device cookie switches to manual mode, and subsequent SSR and hydration use it

#### Scenario: Manual preference is encountered on another device
- **WHEN** an authenticated user with a manual profile preference loads a device whose cookie is missing or automatic
- **THEN** the bootstrap applies the manual preference and automatic detection does not overwrite it

#### Scenario: User returns to Automatic mode
- **WHEN** the user selects Automatic
- **THEN** the profile manual value is cleared and the current device uses its validated detected timezone

### Requirement: Timezone preference boundaries are validated and tenant-safe
The timezone endpoints MUST accept only bounded same-origin requests on a trusted application host, MUST validate mode and IANA timezone values, and MUST issue host-only HttpOnly SameSite=Lax cookies that are Secure in production.

#### Scenario: Invalid timezone is submitted
- **WHEN** a request submits an unsupported timezone, invalid mode, oversized body, untrusted Host, or cross-origin Origin
- **THEN** the request is rejected without changing profile or cookie state

#### Scenario: Tenant host stores a preference
- **WHEN** a valid preference is written from a tenant hostname
- **THEN** the cookie is scoped to that host and is not shared with another tenant hostname

### Requirement: Personal settings expose localized timezone controls
The Personal Settings preferences surface SHALL show the current Automatic or manual timezone state, allow a valid manual IANA value, report save failures, and remain keyboard accessible in supported locales.

#### Scenario: User changes timezone with the keyboard
- **WHEN** the user focuses the timezone control, selects a mode/value, and saves using keyboard input
- **THEN** the preference is persisted and the page reloads with the selected timezone
