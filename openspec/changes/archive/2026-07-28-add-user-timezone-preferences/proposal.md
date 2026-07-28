## Why

Server-rendered dates currently depend on the server's UTC timezone while the browser hydrates them in its local timezone. Timestamps near midnight therefore render different calendar dates and trigger React hydration failures; users also lack a durable way to choose how dates are displayed.

## What Changes

- Keep persisted timestamps as UTC instants while resolving one explicit IANA timezone for every server and client render.
- Detect the browser timezone automatically, persist the device choice in a secure host-only cookie, and refresh once so subsequent SSR uses the same timezone.
- Add an authenticated personal timezone preference where a user can choose automatic detection or a manual IANA timezone override.
- Persist only manual overrides in the user profile; automatic detection remains device-specific and cannot overwrite a manual choice.
- Validate all timezone input and fall back safely to UTC without relying on IP/GPS location or suppressing hydration warnings.

## Capabilities

### New Capabilities

- `user-timezone-preferences`: Deterministic timezone resolution, automatic device detection, secure persistence, personal manual overrides, and consistent date rendering across SSR and hydration.

### Modified Capabilities

None.

## Impact

- Adds an additive nullable user-profile field and corresponding database types.
- Adds timezone resolution/validation utilities, a same-origin timezone API, and root i18n provider configuration.
- Extends the personal settings API and UI with automatic/manual timezone controls.
- Adds focused unit, route, migration, component, and browser regression coverage.
- No new runtime dependency and no change to the UTC storage contract for existing timestamps.
