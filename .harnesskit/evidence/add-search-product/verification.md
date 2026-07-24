# add-search-product verification

Verified at 2026-07-24 18:12 UTC in `/home/ubuntu/workspace/reporting.worktrees/add-search-product` on `codex/add-search-product`.

## Base and architecture

- Base: local `main` commit `90543f57f38f90a8c6e40017c67c0d0abdd96263`, which contains the merged Feeds product and current `origin/main` as an ancestor.
- Path exercised: fund-admin Settings -> `PUT /api/settings/search-categories` -> fund-scoped category configuration -> `/search` -> `POST /api/search` -> `CategoryResolver` -> code-owned `AdapterRegistry` -> bounded `AdapterExecutor` -> Miniflux, Reporting SearXNG, and direct professional adapters. No Provider layer remains.
- No Reporting-owned search index, paid APIs, arbitrary crawling, federated pagination, quota ledger, fuzzy/AI deduplication, or AI ranking was added.

## Automated verification

- `openspec validate add-search-product --strict`: passed.
- `./.harnesskit/scripts/verify-fast.sh`: passed.
- `./.harnesskit/scripts/verify.sh`: executed and stopped in the targeted tier on repository-wide pre-existing ESLint errors outside this change.
- Changed-file ESLint: passed with 0 errors and 2 pre-existing raw-image warnings in the existing Settings page.
- `npx tsc --noEmit`: passed.
- Category-to-Adapter focused Vitest: 20 files passed; 92 tests passed.
- `npm test`: 153 files passed, 2 skipped; 1181 tests passed, 4 environment-gated tests skipped.
- `npx next build --no-lint` with the existing local development environment: passed, including compilation, type validation, static generation, and final optimization.
- `REPORTING_SEARXNG_SECRET=verification-only-secret REPORTING_SEARXNG_HTTP_PROXY=http://host.docker.internal:8118 docker compose -f compose.searxng.yml config --quiet`: passed without printing the secret-bearing expanded configuration.
- Live PostgreSQL migration check: NULL limit/window arguments were rejected; 20 concurrent calls to a 10-request bucket yielded exactly 10 allowed and 10 blocked.
- Live SearXNG: digest-pinned container healthy, bound only to `127.0.0.1:8086`.
- Bootstrap marker scan: no `BOOTSTRAP_ONLY`, `NOT_ARCHITECTURE_COMPLIANT`, or `TEMP_ADAPTER` marker exists in the change.
- `npm audit --json`: current and `HEAD` baseline are identical at 27 advisories (18 high, 2 critical); the added Testing Library/jsdom dev dependencies introduce no new high/critical advisory. Existing framework/tooling advisories remain separate project maintenance debt.

HarnessKit targeted/full were run. They stop at the latest main branch's repository-wide pre-existing ESLint errors outside the Search change. The change-scoped lint, full test suite, typecheck, and no-lint production build above isolate and pass the implemented behavior.

## Real browser and integration path

- Authenticated desktop combined search returned live PubMed and Web results and surfaced upstream engine failures as a partial source state.
- Authenticated fund-admin category acceptance passed: the `internet` category was renamed and remapped from `web` to `pubmed` in Settings; Search immediately rendered the new selected category and returned five live PubMed results through `POST /api/search` with HTTP 200. The original `Internet -> web` configuration was restored afterward.
- Mobile Sources drawer preserved edits as a draft, discarded them on Escape/Cancel, restored focus to the Sources trigger, and kept the committed selection unchanged.
- A caller-scoped Miniflux account returned a real Feed-only result through `POST /api/search`.
- The result opened the real Feed reader, rendered the entry, marked the original HTTPS link with `_blank` and `noopener noreferrer`, closed on Escape, and restored focus to the Reader action.
- Search opens the shared Feed reader with remote images disabled.
- Temporary Reporting and Miniflux users, credentials, entries, and credential-bearing scripts were deleted; both fixture user counts were verified as zero.

Screenshots:

- `desktop-search-final-v2.png`: authenticated desktop combined results and partial-source state.
- `mobile-search-final-v2.png`: authenticated narrow-viewport result list.
- `search-mobile-sources-final.png`: mobile source drawer.
- `search-feed-reader-final.png`: real Miniflux result in the shared Feed reader.
- `category-config-browser-final.png`: fund-configured category label/mapping driving live PubMed results through the real Search page.

## Reviews

- Code review: completed; temporary credentials, unavailable website affordances, source-level states, task evidence wording, and Feed state synchronization were resolved.
- Database review: completed; NULL parameter rejection was added to the atomic service-role-only limiter.
- Security review: completed; temporary credentials/users were removed, Compose documentation now uses `config --quiet`, and Search reader remote images are disabled.
- gstack: not applicable; no gstack executable is installed in this workspace.
