# UI localization browser evidence

- Chrome desktop auth: switched English to Simplified Chinese and back on `/auth?next=%2Fsettings#credentials`; pathname, query, and hash were unchanged.
- Successful selection updated localized copy, the selector accessible name, and `document.documentElement.lang` immediately.
- Reload and a new same-origin tab retained `zh-CN` through the HttpOnly `NEXT_LOCALE` cookie.
- Chrome public desktop/mobile: shared navigation and language controls rendered in Chinese; the mobile drawer opened and closed with localized accessible labels.
- Chrome auth mobile: localized form and selector fit the mobile viewport.
- Dark system preference remained active after switching to Chinese.
- Authenticated Chrome desktop: switched English to Simplified Chinese while retaining the viewer session and the exact `/dashboard?view=companies#portfolio` URL.
- Authenticated dynamic route: switched on `/deals/[id]?tab=overview#notes`; pathname, query, hash, and session were all preserved.
- Authenticated persistence: `zh-CN` remained active after client-side navigation to another application page.
- Authenticated Chrome mobile: the Chinese drawer, theme control, language control, and localized close label fit a 390 x 844 viewport.
- Keyboard acceptance: focused the visible mobile language combobox, opened it with Enter, selected English with Home + Enter, and verified `lang="en"`.
- Accessibility follow-up: added localized hidden drawer title/description; a clean drawer-open console pass had no errors.
- Page errors: none. Clean console contained only development Fast Refresh output. Earlier blocked Vercel development analytics/speed-insights scripts were environmental. No application 4xx/5xx requests were captured.
- The temporary local-only viewer identity and its one fund membership were deleted and verified absent after acceptance.
- Authenticated Import desktop: `/import` rendered Chinese metadata and all four business workflows; the embedded Analyst panel rendered Chinese conversation controls, placeholders, and accessible action labels.

Screenshots:

- `auth-en-desktop.png`
- `auth-zh-desktop.png`
- `auth-zh-mobile.png`
- `auth-zh-dark.png`
- `public-license-zh-desktop.png`
- `public-license-zh-mobile-menu.png`
- `app-en-desktop.png`
- `app-zh-desktop.png`
- `app-zh-mobile.png`
- `app-zh-mobile-menu.png`

Automated final pass:

- Focused Vitest: 76 passed across six files, including complete Import/embedded Analyst namespace coverage, guarded hash restoration, and development loopback/bind-host port-forward Origin coverage.
- TypeScript: `npx tsc --noEmit` passed.
- Targeted ESLint: 0 errors; one pre-existing `app-header.tsx` image warning.
- OpenSpec strict validation, HarnessKit fast verification, and `git diff --check` passed.
- Final authenticated rerun: the exact dynamic URL `/deals/[id]?tab=overview#notes`, viewer session, and selected locale survived switching; closing the mobile drawer restored focus to its opener.
- Codex in-app forwarding regression: requests from `http://localhost:59343` to the dev server on port `3137` no longer fail Origin validation when the proxy rewrites the internal host to a loopback or bind address. The exception is limited to non-production, same-scheme, loopback browser origins and explicit local internal hosts; production and non-loopback browser origins remain strict.
