## 1. Timezone Contract and Persistence

- [x] 1.1 Add failing tests for IANA validation, cookie parsing, resolution precedence, invalid fallback, and cross-midnight deterministic formatting.
- [x] 1.2 Implement the shared timezone contract with UTC fallback and immutable resolver results.
- [x] 1.3 Add a failing migration/security contract test for nullable manual timezone persistence and a narrow service RPC.
- [x] 1.4 Add the user-profile migration, generated database types, and identity profile load/save support.

## 2. Request and Cookie Synchronization

- [x] 2.1 Add failing route tests for body bounds, exact mode/value validation, trusted Host/Origin, cookie flags, signed-out automatic writes, and authenticated manual lookup.
- [x] 2.2 Implement the timezone API using the existing locale route's request and cookie security boundaries.
- [x] 2.3 Add failing bootstrap tests for first detection, no-op matching state, manual precedence, remote manual synchronization, and reload-loop prevention.
- [x] 2.4 Implement the root timezone bootstrap and synchronize only validated changed preferences.

## 3. Deterministic Internationalization Runtime

- [x] 3.1 Add failing provider/request tests proving server and client formatters receive the same explicit timezone.
- [x] 3.2 Pass the resolved timezone through `i18n/request.ts`, the root layout, and `NextIntlClientProvider`.
- [ ] 3.3 Audit hydrated date formatting paths and add explicit timezone handling only where they bypass the shared next-intl runtime.

## 4. Personal Manual Override

- [x] 4.1 Add failing personal API/profile tests for manual save, automatic reset, invalid input, and mutation exclusivity.
- [x] 4.2 Extend the personal settings API with authenticated manual timezone persistence.
- [x] 4.3 Add failing localized UI tests for Automatic/manual controls, supported IANA choices, error state, and keyboard-accessible labels.
- [x] 4.4 Implement the personal timezone control and localized English/Chinese copy, synchronizing the current device after save.

## 5. Verification and Review

- [ ] 5.1 Run focused timezone/profile/route/provider/UI tests, TypeScript, changed-file lint, strict OpenSpec validation, HarnessKit fast/targeted, and `git diff --check`.
- [ ] 5.2 Run code, database, and security reviews and resolve all blocker/high findings.
- [ ] 5.3 Start the real application and verify automatic `Asia/Shanghai`, manual UTC, reset-to-Automatic, reload persistence, tenant-host cookie isolation, and zero hydration console errors.
- [ ] 5.4 Run production build/full verification, record unrelated baseline gaps, and update HarnessKit/OpenSpec completion evidence.
