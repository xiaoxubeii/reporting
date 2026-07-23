## Context

Reporting needs one Search page for three practical user needs:

1. Find articles already present in the current user's Miniflux account.
2. Search the public Web through a Reporting-owned SearXNG instance.
3. Search five public professional sources directly: PubMed, ClinicalTrials.gov, FDA/openFDA, TCTMD, and MassDevice.

The first release is a bounded live federated search. Reporting does not build or maintain a search index, mirror professional datasets, crawl arbitrary websites, fetch result detail pages, or retain search history. The browser talks only to Reporting; Reporting owns authentication, source selection, timeouts, normalization, result limits, and merging.

```text
Search page
    |
    `-- POST /api/search
            |
            `-- SearchService
                    |-- FeedSearchProvider
                    |      `-- Miniflux
                    |
                    |-- WebSearchProvider
                    |      `-- Reporting SearXNG
                    |              |-- Bing / Bing News
                    |              |-- DuckDuckGo / DuckDuckGo News
                    |              |-- Brave Standard / Brave News
                    |              `-- Startpage / Startpage News
                    |
                    `-- SpecializedSearchProvider
                           |-- Public API adapters
                           |      |-- PubMed
                           |      |-- ClinicalTrials.gov
                           |      `-- FDA/openFDA
                           |
                           `-- Website adapters
                                  |-- TCTMD
                                  `-- MassDevice
```

## Goals / Non-Goals

**Goals:**

- Provide one explicit-submit Search page with a simple query input and independent source selection.
- Keep exactly three top-level provider boundaries: Feeds, Web, and Specialized.
- Search Miniflux and SearXNG without exposing either service to the browser.
- Directly query the fixed five-source professional catalog through a small internal adapter contract.
- Return one normalized result list while preserving all matching source identities and origin-specific actions.
- Execute selected providers and professional sources concurrently, isolate failures, and return useful partial results.
- Keep first-release latency and implementation bounded through fixed source/result limits rather than federated pagination.
- Enforce user/fund access, provider enablement, basic per-user rate limiting, privacy, and safe rendering at the Reporting boundary.

**Non-goals:**

- Building a Reporting-owned search index or syncing complete external datasets.
- General-purpose crawling, arbitrary URL search, result-detail-page crawling, or headless-browser automation.
- Searching a professional website indirectly through SearXNG `site:` queries.
- Runtime plugin installation, user-defined adapters, endpoints, engine lists, or CSS selectors.
- Paid/licensed APIs, fund credential management, fund quota ledgers, or cost accounting.
- Cross-provider pagination, opaque cursors, or a first-release `Load more` flow.
- Fuzzy-title deduplication, semantic deduplication, AI reranking, Boolean builders, AI summaries, saved searches, scheduled monitoring, or alerts.
- Using RSSHub as a search backend. Feed discovery remains a separate follow workflow.

## Decisions

### 1. One Search page with fixed defaults

Search is a top-level product page rather than an extension of the Miniflux entry endpoint.

```text
Search

+--------------------------------------------------+
| Search companies, products, topics...   [Search] |
+--------------------------------------------------+

Results                                  Sources
                                         [x] Feeds
                                         [x] Web
                                         [ ] Professional sources
                                             [ ] PubMed
                                             [ ] ClinicalTrials.gov
                                             [ ] FDA/openFDA
                                             [ ] TCTMD
                                             [ ] MassDevice
```

Feeds and Web are selected by default. Professional sources are visible but off by default and run only after explicit selection. Search runs only after form submission.

If the caller has no usable Miniflux connection or Feeds access, Feeds is disabled and Web remains selected when available. If SearXNG is unavailable, Web is disabled and Feeds remains selected when available. At least one available source must be selected; otherwise the client and server return validation feedback without calling an upstream source.

### 2. One small request and response contract

The browser calls one endpoint:

```http
POST /api/search
```

```json
{
  "query": "AI radiology",
  "sources": {
    "feeds": true,
    "web": true,
    "specialized": ["pubmed", "clinical_trials"]
  }
}
```

The server validates query length, control characters, at least one available selection, and registered professional source IDs. The request schema accepts only the query and source selection; clients cannot control Miniflux URLs, SearXNG engines, professional endpoints, or parser configuration.

The response contains normalized results plus one status per selected provider/source:

```json
{
  "results": [],
  "sources": [
    { "id": "feeds", "status": "ok", "resultCount": 0 },
    { "id": "web", "status": "timeout", "resultCount": 0 }
  ],
  "partial": true
}
```

GET query parameters are not used for search execution. Shareable query URLs and persisted search history are outside the first release.

### 3. SearchService owns exactly three providers

```ts
interface SearchProvider {
  search(
    request: SearchProviderRequest,
    context: SearchContext,
  ): Promise<SearchProviderResults>;
}
```

- `FeedSearchProvider` queries only the authenticated user's Miniflux account and preserves reader state.
- `WebSearchProvider` calls only the Reporting-owned SearXNG instance using the configured Web and News categories.
- `SpecializedSearchProvider` directly queries selected professional sources through its code registry.

The browser never calls Miniflux, SearXNG, a medical website, or a professional API directly.

### 4. SpecializedSearchProvider uses one minimal public-source contract

```ts
interface SpecializedSourceAdapter {
  readonly descriptor: SpecializedSourceDescriptor;

  search(
    request: SpecializedSourceSearchRequest,
    context: SpecializedSearchContext,
  ): Promise<SpecializedSourceResults>;
}

interface SpecializedSourceDescriptor {
  id: "pubmed" | "clinical_trials" | "fda" | "tctmd" | "massdevice";
  label: string;
  adapterType: "website" | "api";
}
```

Adapters are registered in code. Adding another source requires a separate reviewed change, fixtures/tests, and deployment. There is no runtime adapter installation or generic user configuration.

`SpecializedSearchProvider` resolves selected IDs, checks fund source enablement, runs allowed adapters concurrently, and merges their results. It does not contain source-specific URLs, selectors, or response parsing.

### 5. The first professional source set matches ClinMono's direct-source catalog

The first release implements exactly five public adapters:

- `pubmed`: NCBI E-utilities search and summary APIs.
- `clinical_trials`: ClinicalTrials.gov API v2.
- `fda`: the applicable public openFDA endpoints used by the FDA adapter.
- `tctmd`: direct bounded search of the TCTMD website.
- `massdevice`: direct bounded search of the MassDevice website.

Reporting uses the same stable source IDs and provenance labels as ClinMono where applicable, but owns its own adapters and tests. ClinMono's broader classification registry does not automatically enable NMPA, CMDE, SAMR, WHO, PMC, SinoMed, Wanfang, HPRA, EUDAMED, or other sources in this change.

### 6. Website adapters perform direct, bounded HTML search

TCTMD and MassDevice adapters call only their fixed search endpoints and parse only their search result pages.

Website adapter rules:

- Scheme, hostname, port, path template, query parameters, allowed redirect hosts, allowed result hosts, and result-path rules are fixed server-side.
- User input is encoded only into documented search parameters.
- The adapter does not traverse arbitrary site links or fetch result detail pages.
- Responses have strict timeout, redirect, content-type, and body-size limits.
- Parsed fields are limited to title, allowed canonical result URL, snippet, publication date when available, and source identity.
- HTML is converted to bounded plain text before normalization and rendering.
- Each parser has saved HTML fixtures, including off-domain/ad fixtures, and fails visibly when required structure changes.
- A broken website adapter returns a source-level failure and does not fall back to SearXNG.

Server-side HTTP plus a focused HTML parser is sufficient. Headless-browser execution is outside the search path.

### 7. API adapters call public APIs directly

Each API adapter owns translation from the standard query into documented source parameters, response schema validation, and normalization. API keys or licensed-source credential storage are not part of this release.

PubMed, ClinicalTrials.gov, and FDA/openFDA retain their stable PMID, NCT, FDA application, 510(k), or other allowlisted regulatory identifiers when present. Raw upstream response objects are not forwarded to the browser.

### 8. Reporting owns its SearXNG service and engine allowlist

Reporting does not depend on the existing Refly-owned `refly_searxng` container. It deploys a separate service with a version- or digest-pinned image, independent secret, loopback-only host binding for the current host-network Reporting runtime, JSON output, POST search, and a local healthcheck that does not perform a real external search.

The first engine allowlist is fixed:

```text
General: bing, duckduckgo, brave, startpage
News:    bing news, duckduckgo news, brave.news, startpage news
```

`brave` means the standard SearXNG engine, not the API-key-backed `braveapi`. SearXNG configuration controls engines and categories; the browser selects only Web, never an engine. Engines outside this list remain inactive. Provider health and engine failures are visible operationally, while one failed engine does not expose raw SearXNG errors to the browser.

### 9. Execution and result windows stay bounded

Selected top-level providers and professional adapters execute concurrently with short timeouts, cancellation where available, and bounded concurrency. `Promise.allSettled`-style behavior preserves successful results when another source fails.

The first-release server-owned limits are:

```text
FeedSearchProvider:          10 candidates
WebSearchProvider:           10 aggregate SearXNG candidates
Each professional adapter:    5 candidates
Final merged response:        30 results maximum
```

The limits are not client-configurable. Search returns only this first result window. Users refine the query, change selected sources, or continue on the original source when they need more results.

### 10. Results preserve primary origin and all provenance

```ts
interface SearchHit {
  id: string;
  primaryOrigin: "feed" | "specialized" | "web";
  origins: Array<"feed" | "specialized" | "web">;
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  sources: Array<{ id: string; label: string }>;
  identifiers?: {
    doi?: string;
    pmid?: string;
    nct?: string;
    fdaId?: string;
  };
  isRead?: boolean;
  isSaved?: boolean;
}
```

Feed-primary results may expose existing read/saved state and open in the Reporting reader. Specialized- and Web-primary results open the verified original URL. Arbitrary source fields are never forwarded.

### 11. Merging is exact, deterministic, and simple

The first release does not compare raw relevance scores, fuzzily compare titles, or use an AI reranker.

1. Preserve each provider/source's native ordering.
2. Canonicalize safe HTTP(S) URLs and group exact URL duplicates.
3. Group exact professional records by allowlisted DOI, PMID, NCT, or FDA identifier.
4. Choose primary origin using `Feed > Specialized > Web`.
5. Merge all matching source labels and professional identifiers into the retained hit.
6. Deterministically interleave remaining provider/source lists up to the 30-result cap.

A Feed-primary duplicate keeps its reader/read/saved behavior while retaining PubMed, ClinicalTrials, FDA, or other professional provenance. Fuzzy title matching is explicitly deferred because a false merge is worse than a visible duplicate.

### 12. Access, rate limiting, privacy, and external safety stay server-side

- Search uses feature key `search` in the existing `dealflow` access domain.
- Feed selection additionally requires permitted Feeds read access and the current user's Miniflux connection.
- Web and each professional source can be enabled or disabled for a fund, but no per-fund call quota or cost ledger is added.
- A basic per-user request rate limit is enforced before upstream calls.
- Usage metrics contain provider/source ID, timing, status, and result count only. Raw queries, result bodies, credentials, and cost records are not retained.
- Titles and snippets are rendered as text, never injected as HTML.
- Result URLs are restricted to validated public HTTP(S) targets; credential-bearing, local, private-network, unsafe-scheme, and adapter-off-domain targets are rejected.
- Search does not download remote thumbnails, favicons, or result-page assets.
- If results later enter an AI workflow, they remain untrusted evidence and cannot supply executable instructions.

### 13. Responsive and accessible behavior stays conventional

- Desktop uses a result column plus a source rail.
- Narrow screens place Sources in a filter drawer and keep query/results primary.
- Source controls are native labeled checkboxes with keyboard-visible focus.
- Loading, unavailable, empty, partial, rate-limited, and failed states have text equivalents and live-region announcements where appropriate.
- Closing a Feed reader restores focus to the result that opened it.

## Risks / Trade-offs

- **Direct website search is fragile** -> Limit the first release to TCTMD and MassDevice, keep source-specific fixtures, validate result hosts, and disable one broken adapter without failing the provider.
- **External sources dominate latency** -> Execute concurrently, cap timeouts and result counts, return partial results, and avoid detail-page fetching or pagination.
- **SearXNG engines can rate-limit or block the server** -> Use four reviewed engine families, bounded requests, health/error metrics, and no public anonymous endpoint.
- **Exact-only deduplication leaves some visible duplicates** -> Accept this to avoid false merges; stable identifiers and canonical URLs cover the reliable cases.
- **No pagination limits recall** -> Prefer query refinement and source links in the first release; add single-source continuation later only if usage data demonstrates need.
- **A fixed adapter registry is less flexible** -> Accept this intentionally; source additions remain reviewed changes rather than runtime configuration.

## Migration Plan

1. Keep Search disabled by default behind `dealflow.search`.
2. Confirm the Miniflux-backed Feeds capability has landed.
3. Define the request, response, provider, source-status, result, and exact merge contracts.
4. Deploy a Reporting-owned pinned SearXNG service with loopback binding, independent secret, JSON/POST configuration, healthcheck, and the fixed Web/News allowlist.
5. Implement FeedSearchProvider and WebSearchProvider.
6. Implement SpecializedSearchProvider plus PubMed, ClinicalTrials.gov, FDA/openFDA, TCTMD, and MassDevice adapters.
7. Add `POST /api/search` with validation, bounded concurrency, partial failure, fixed result windows, access checks, rate limiting, privacy, and safe normalization.
8. Add the Search page, default source selection, professional source controls, unified result list, source statuses, and origin-correct actions.
9. Verify Feed-only, Web-only, specialized-only, combined, zero-source, timeout, malformed/off-domain HTML, duplicate, rate-limit, mobile, and keyboard flows before enabling a pilot fund.

No local index or search-history migration is part of this change. Rollback disables Search, removes its navigation entry, and stops the Reporting-owned SearXNG service; existing Miniflux subscriptions and reader state remain untouched.
