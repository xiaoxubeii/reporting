## Context

The application stores timestamp instants in UTC, but `next-intl` currently receives only locale and messages. During SSR, Node formats dates in UTC; during hydration, the browser formats the same instant in its local timezone. A timestamp near midnight can therefore produce two calendar dates and a React hydration error. The existing locale preference route provides a useful security precedent: bounded JSON, trusted Host/Origin validation, and a host-only HttpOnly preference cookie. Personal identity preferences already live in `user_profiles` and `/settings/personal`.

## Goals / Non-Goals

**Goals:**

- Preserve UTC timestamp storage while making the render timezone explicit and deterministic.
- Detect a browser's IANA timezone without IP/GPS access and persist it per device.
- Persist an authenticated user's manual IANA override across devices.
- Guarantee that SSR and hydration use the same timezone on every request.
- Reject malformed or unsupported timezone input and safely fall back to UTC.

**Non-Goals:**

- Changing existing timestamp columns or rewriting stored instants.
- Inferring physical location from IP, GPS, language, or tenant name.
- Adding tenant-level timezone administration in this change.
- Hiding mismatches with `suppressHydrationWarning` or making dates client-only.

## Decisions

### One validated resolver is authoritative

Create a small server-safe timezone module that validates IANA identifiers with `Intl.DateTimeFormat`, applies a bounded length, and resolves `manual cookie -> automatic cookie -> UTC`. The resolver returns both `timeZone` and `source`; invalid cookies are treated as absent. `i18n/request.ts`, the root layout, and `NextIntlClientProvider` receive the same resolved timezone.

Alternative considered: configure UTC only. This is deterministic but does not meet the approved local-display requirement. Alternative considered: let each browser format locally. That recreates the hydration failure.

### The first request is deterministic UTC, then detection refreshes once

When no valid cookie exists, SSR and the initial client render both use UTC. A root client bootstrap detects `Intl.DateTimeFormat().resolvedOptions().timeZone`, persists it through the timezone API, and reloads only after the cookie value changes. The next request renders the detected zone on both sides.

Alternative considered: render a client-only placeholder. It avoids the warning but causes visible layout/date changes and removes useful SSR content.

### Automatic choice is device-local; manual choice is account-level

The host-only HttpOnly cookie records the active render mode and timezone for the current device. `user_profiles.time_zone` stores only a manual override; `NULL` means Automatic. The bootstrap checks the authenticated profile when the current render is not already manual. A remote manual preference replaces an automatic cookie; otherwise browser detection maintains the automatic cookie. This prevents one device's automatic timezone from overwriting another while allowing a deliberate manual choice to follow the user.

Alternative considered: store every detected timezone in the profile. That makes travel or one device silently change all other devices.

### APIs keep profile and cookie responsibilities explicit

`/api/time-zone` owns validated cookie reads/writes and can report an authenticated manual profile override to the bootstrap. The existing personal settings API owns changing `user_profiles.time_zone`. Manual-save UI first persists the profile and then synchronizes the current-device cookie; Automatic clears the profile and writes the detected device timezone. Both endpoints fail closed and return user-facing errors without leaking internals.

### Database change is additive and app validation is authoritative

Add nullable `user_profiles.time_zone text` with conservative length/control-character checks and a narrowly granted security-definer RPC for the existing admin-backed identity service. PostgreSQL does not ship an authoritative evolving IANA registry, so the application validates actual IANA support. Invalid legacy values resolve to UTC and can be corrected from Settings.

## Risks / Trade-offs

- **First visit needs one refresh before local dates appear** -> Render UTC consistently first, persist once, and reload only when a validated detected value differs.
- **A stale automatic cookie could mask a manual preference changed on another device** -> Bootstrap checks the authenticated manual profile whenever the current source is not manual.
- **Timezone databases evolve** -> Validate at every boundary and fall back to UTC rather than failing the page.
- **A global bootstrap can create request noise** -> Skip profile/cookie work when the current source is manual; avoid writes and reloads when values already match.
- **Cookie tampering or cross-tenant leakage** -> Use validated, HttpOnly, SameSite=Lax, Secure-in-production, host-only cookies and trusted Host/Origin checks.

## Migration Plan

1. Apply the additive `user_profiles.time_zone` migration and update generated database types.
2. Deploy validation/resolution and timezone API; absent cookies continue to render UTC safely.
3. Deploy the root provider/bootstrap and personal settings control.
4. Existing users automatically acquire a device cookie after their next page load; no timestamp data backfill is required.
5. Rollback may remove UI/bootstrap/provider use while leaving the nullable column and inert cookie in place; dropping the column is optional and not required for safe rollback.

## Open Questions

None. A tenant-default timezone remains a future extension point between automatic cookie and UTC fallback.
