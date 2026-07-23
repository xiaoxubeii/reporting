# add-search-product verification

Verified at 2026-07-23 14:32 UTC in `/home/ubuntu/workspace/reporting.worktrees/add-search-product` on `codex/add-search-product`.

## Base and architecture

- Base: local `main` commit `90543f57f38f90a8c6e40017c67c0d0abdd96263`, which contains the merged Feeds product and current `origin/main` as an ancestor.
- Path exercised: `/search` -> `POST /api/search` -> `SearchService` -> `FeedSearchProvider`, `WebSearchProvider`, and `SpecializedSearchProvider` -> Miniflux, Reporting SearXNG, and direct professional adapters.
- No Reporting-owned search index, paid APIs, arbitrary crawling, federated pagination, quota ledger, fuzzy/AI deduplication, or AI ranking was added.

## Automated verification

- `openspec validate add-search-product --strict`: passed.
- `./.harnesskit/scripts/verify-fast.sh`: passed.
- Changed-file ESLint: passed with 0 errors; the existing `FeedReaderSheet` raw-image warning remains outside Search's remote-image-disabled mode.
- `npx tsc --noEmit`: passed.
- `npm test`: 148 files passed, 2 skipped; 1169 tests passed, 4 environment-gated tests skipped.
- `npx next build --no-lint` with the existing local development environment: passed, including compilation, type validation, static generation, and final optimization.
- `docker compose -f compose.searxng.yml config --quiet`: passed without printing the secret-bearing expanded configuration.
- Live PostgreSQL migration check: NULL limit/window arguments were rejected; 20 concurrent calls to a 10-request bucket yielded exactly 10 allowed and 10 blocked.
- Live SearXNG: digest-pinned container healthy, bound only to `127.0.0.1:8086`.
- Bootstrap marker scan: no `BOOTSTRAP_ONLY`, `NOT_ARCHITECTURE_COMPLIANT`, or `TEMP_ADAPTER` marker exists in the change.
- `npm audit --json`: current and `HEAD` baseline are identical at 27 advisories (18 high, 2 critical); the added Testing Library/jsdom dev dependencies introduce no new high/critical advisory. Existing framework/tooling advisories remain separate project maintenance debt.

HarnessKit targeted/full were run. They stop at the latest main branch's repository-wide pre-existing ESLint errors outside the Search change. The change-scoped lint, full test suite, typecheck, and no-lint production build above isolate and pass the implemented behavior.

## Real browser and integration path

- Authenticated desktop combined search returned live PubMed and Web results and surfaced upstream engine failures as a partial source state.
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

## Reviews

- Code review: completed; temporary credentials, unavailable website affordances, source-level states, task evidence wording, and Feed state synchronization were resolved.
- Database review: completed; NULL parameter rejection was added to the atomic service-role-only limiter.
- Security review: completed; temporary credentials/users were removed, Compose documentation now uses `config --quiet`, and Search reader remote images are disabled.
- gstack: not applicable; no gstack executable is installed in this workspace.
