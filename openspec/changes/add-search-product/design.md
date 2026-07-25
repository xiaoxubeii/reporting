## Context

Reporting needs one Search page for three practical user needs:

1. Find articles already present in the current user's Miniflux account.
2. Search the public Web through a Reporting-owned SearXNG instance.
3. Search the enabled members of a five-source professional catalog directly: PubMed, ClinicalTrials.gov, FDA/openFDA 510(k), TCTMD, and MassDevice.

The first release is a bounded live federated search. Reporting does not build or maintain a search index, mirror professional datasets, crawl arbitrary websites, fetch result detail pages, or retain search history. The browser talks only to Reporting; Reporting owns authentication, category resolution, adapter execution, timeouts, normalization, result limits, and merging.

```text
Search page -> selected category IDs
    |
    `-- POST /api/search
            |
            `-- SearchService
                    |-- CategoryResolver (fund configuration)
                    |-- AdapterRegistry (code reviewed IDs)
                    `-- AdapterExecutor
                           |-- Miniflux Feed adapter
                           |-- SearXNG Web adapter
                           |-- PubMed / ClinicalTrials.gov / FDA API adapters
                           `-- TCTMD / MassDevice website adapters
```

## Goals / Non-Goals

**Goals:**

- Provide one explicit-submit Search page with a simple query input and category selection.
- Keep one execution abstraction: registered Search adapters. Categories organize adapters but do not execute searches.
- Let fund administrators configure category presentation and mappings without changing code.
- Search Miniflux and SearXNG without exposing either service to the browser.
- Directly query enabled professional sources through a fixed five-source internal adapter catalog; disabled website transports remain visible and unavailable rather than falling back.
- Return one normalized result list while preserving all matching source identities and origin-specific actions.
- Resolve selected categories server-side, execute their distinct adapters concurrently, isolate failures, and return useful partial results.
- Keep first-release latency and implementation bounded through fixed source/result limits rather than federated pagination.
- Enforce user/fund access, adapter enablement, basic per-user rate limiting, privacy, and safe rendering at the Reporting boundary.

**Non-goals:**

- Building a Reporting-owned search index or syncing complete external datasets.
- General-purpose crawling, arbitrary URL search, result-detail-page crawling, or headless-browser automation.
- Searching a professional website indirectly through SearXNG `site:` queries.
- Runtime plugin installation, user-defined adapters, endpoints, engine lists, CSS selectors, or arbitrary executable configuration.
- A new platform-administrator identity. Category configuration uses the existing fund-admin boundary.
- Paid/licensed APIs, fund credential management, fund quota ledgers, or cost accounting.
- Cross-adapter pagination, opaque cursors, or a first-release `Load more` flow.
- Fuzzy-title deduplication, semantic deduplication, AI reranking, Boolean builders, AI summaries, saved searches, scheduled monitoring, or alerts.
- Using RSSHub as a search backend. Feed discovery remains a separate follow workflow.

## Decisions

### 1. One Search page with fund-configured categories

Search is a top-level product page rather than an extension of the Miniflux entry endpoint.

```text
Search

+--------------------------------------------------+
| Search companies, products, topics...   [Search] |
+--------------------------------------------------+

Results                                  Search categories
                                         [x] Personal subscriptions
                                         [x] Internet
                                         [ ] Medical literature
                                         [ ] Clinical trials
                                         [ ] Medical regulatory
```

The database seed selects Personal subscriptions and Internet by default. Professional categories are visible but off by default and run only after explicit selection. A fund administrator can reorder, rename, describe, enable, choose defaults, add/remove categories, and map them to registered adapters. Search runs only after form submission.

If the caller has no usable Miniflux connection or Feeds access, Feeds is disabled and Web remains selected when available. If SearXNG is unavailable, Web is disabled and Feeds remains selected when available. At least one available source must be selected; otherwise the client and server return validation feedback without calling an upstream source.

### 2. One small category request and source-status response contract

The browser calls one endpoint:

```http
POST /api/search
```

```json
{
  "query": "AI radiology",
  "categoryIds": ["personal-subscriptions", "internet", "medical-literature"]
}
```

The server validates query length, control characters, category ID shape/uniqueness, at least one selection, and membership in the current fund's enabled category configuration. The server—not the browser—resolves categories to distinct adapter IDs and intersects them with the code registry, caller access, fund source policy, and runtime availability. Clients cannot submit adapter IDs, Miniflux URLs, SearXNG engines, professional endpoints, or parser configuration.

The response uses the existing API envelope and contains normalized results plus one status per selected adapter/source:

```json
{
  "success": true,
  "data": {
    "results": [],
    "sources": [
      { "id": "feeds", "status": "empty", "resultCount": 0 },
      { "id": "web", "status": "timeout", "resultCount": 0 }
    ],
    "partial": true
  },
  "error": null
}
```

GET query parameters are not used for search execution. Shareable query URLs and persisted search history are outside the first release.

### 3. SearchService resolves categories and executes adapters

```ts
interface SearchAdapter {
  readonly descriptor: SearchAdapterDescriptor;
  search(
    request: SearchAdapterRequest,
    context: SearchContext,
  ): Promise<SearchAdapterResults>;
}
```

- `MinifluxFeedSearchAdapter` queries only the authenticated user's Miniflux account and preserves reader state.
- `SearxngWebSearchAdapter` calls only the Reporting-owned SearXNG instance using the configured Web and News categories.
- PubMed, ClinicalTrials.gov, FDA/openFDA, TCTMD, and MassDevice remain direct code-reviewed adapters.
- `CategoryResolver` loads the current fund configuration and expands selected category IDs to distinct registered adapter IDs.
- `AdapterRegistry` is code-owned and rejects unknown/duplicate descriptors. Configuration can reference an unavailable registered adapter but can never create an adapter.
- `AdapterExecutor` applies bounded concurrency, per-adapter deadlines, normalization, metrics, and all-settled partial-result behavior.

The browser never calls Miniflux, SearXNG, a medical website, or a professional API directly.

### 4. One minimal adapter contract covers Feed, Web, API, and Website searches

```ts
interface SearchAdapter {
  readonly descriptor: SearchAdapterDescriptor;

  search(
    request: SearchAdapterRequest,
    context: SearchContext,
  ): Promise<SearchAdapterResults>;
}

interface SearchAdapterDescriptor {
  id: "feeds" | "web" | "pubmed" | "clinical_trials" | "fda" | "tctmd" | "massdevice";
  label: string;
  origin: "feed" | "web" | "specialized";
  adapterType: "feed" | "metasearch" | "website" | "api";
  liveTransportAvailable: boolean;
}
```

Adapters are registered in code. Adding another source requires a separate reviewed change, fixtures/tests, and deployment. There is no runtime adapter installation. Category configuration contains presentation data and adapter IDs only; it never contains source-specific URLs, selectors, credentials, response parsing, or dynamic module names.

### 4a. Category configuration is fund-scoped and atomically managed

`fund_settings.search_category_config` stores a versioned ordered JSON document:

```json
{
  "version": 1,
  "categories": [{
    "id": "medical-literature",
    "label": { "en": "Medical literature", "zh-CN": "医学文献" },
    "description": { "en": "Reviewed literature databases", "zh-CN": "经过审查的医学文献数据库" },
    "enabled": true,
    "defaultSelected": false,
    "adapterIds": ["pubmed"]
  }]
}
```

The fund-admin Settings API validates bounded labels/descriptions, stable unique IDs, category count, adapter count, and registered adapter IDs, then atomically replaces the whole immutable document for the authenticated admin's fund. The request never accepts `fundId`. Database constraints enforce the coarse version/object/array envelope while server parsing enforces the exact schema. Existing `search_source_config` remains a second, operator-owned execution allowlist rather than being overloaded with presentation concerns.

### 5. The first professional source set matches ClinMono's direct-source catalog

The first release implements exactly five public adapters:

- `pubmed`: NCBI E-utilities search and summary APIs.
- `clinical_trials`: ClinicalTrials.gov API v2.
- `fda`: the public openFDA device 510(k) endpoint, normalized by `k_number`.
- `tctmd`: a registered bounded TCTMD search-result parser; live transport requires written permission and a reachable approved endpoint.
- `massdevice`: a registered bounded MassDevice search-result parser; live transport requires a reachable operator-approved endpoint.

Reporting uses the same stable source IDs and provenance labels as ClinMono where applicable, but owns its own adapters and tests. ClinMono's broader classification registry does not automatically enable NMPA, CMDE, SAMR, WHO, PMC, SinoMed, Wanfang, HPRA, EUDAMED, or other sources in this change.

### 6. Website adapters perform direct, bounded HTML search

TCTMD and MassDevice adapters call only their fixed search endpoints and parse only their search result pages.

Website adapter rules:

- The live transport remains unavailable until an operator has confirmed automation permission, robots/terms compatibility, and a reachable approved endpoint. TCTMD and MassDevice are unavailable by default in the first deployment.

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

The deployment routes SearXNG engine traffic through the existing Privoxy service at port `8118`. SearXNG joins the proxy's Docker network and resolves the service by name instead of using a mutable container IP or gaining a stable host-gateway path. The healthcheck verifies both the local SearXNG process and proxy reachability without executing an external search, while the 4-second engine timeout remains below Reporting's 8-second adapter deadline.

The proxy network is a deployment trust boundary: only trusted VPN, proxy, and search infrastructure may join it. This local deployment reuses `vpnserver-proxy_default`; production deployments should provide a dedicated network containing only SearXNG and the controlled proxy/forwarder so unrelated containers cannot reach SearXNG's internal port.

The first engine allowlist is fixed:

```text
General: bing, duckduckgo, brave, startpage
News:    bing news, duckduckgo news, brave.news, startpage news
```

`brave` means the standard SearXNG engine, not the API-key-backed `braveapi`. SearXNG configuration controls engines and categories; the browser selects only Web, never an engine. Engines outside this list remain inactive. Adapter health and engine failures are visible operationally, while one failed engine does not expose raw SearXNG errors to the browser.

SearXNG engines are redundant implementation details behind the logical Web source. If the aggregate response contains at least one valid Web candidate, Web reports `ok` and no user-visible partial warning is shown even when `unresponsive_engines` is non-empty. If the aggregate response has no valid candidate, an engine failure reports Web as retryable `failed`; no candidates with healthy engines reports `empty`. Professional adapters remain independently executed sources behind selected categories, so their failures continue to produce source-level warnings.

### 9. Execution and result windows stay bounded

Resolved adapters execute concurrently with short timeouts, cancellation where available, and bounded concurrency. `Promise.allSettled`-style behavior preserves successful results when another source fails. Multiple selected categories that map to the same adapter execute it once.

The first-release server-owned limits are:

```text
Miniflux Feed adapter:       10 candidates
SearXNG Web adapter:         10 aggregate SearXNG candidates
Each professional adapter:    5 candidates
Final merged response:        30 results maximum
```

The limits are not client-configurable. Search returns only this first result window. Users refine the query, change selected categories, or continue on the original source when they need more results.

### 10. Results preserve primary origin and all provenance

```ts
interface SearchHit {
  id: string;
  primaryOrigin: "feed" | "specialized" | "web";
  origins: Array<"feed" | "specialized" | "web">;
  title: string;
  url?: string;
  snippet?: string;
  publishedAt?: string;
  sources: Array<{ id: string; label: string }>;
  identifiers?: {
    doi?: string;
    pmid?: string;
    nct?: string;
    fdaId?: string;
  };
  feedEntryId?: number;
  isRead?: boolean;
  isSaved?: boolean;
}
```

Feed-primary results may expose existing read/saved state and open in the Reporting reader. Specialized- and Web-primary results open the verified original URL. Arbitrary source fields are never forwarded.

### 11. Merging is exact, deterministic, and simple

The first release does not compare raw relevance scores, fuzzily compare titles, or use an AI reranker.

1. Preserve each adapter/source's native ordering.
2. Canonicalize safe HTTP(S) URLs and group exact URL duplicates.
3. Group exact professional records by allowlisted DOI, PMID, NCT, or FDA identifier.
4. Choose primary origin using `Feed > Specialized > Web`.
5. Merge all matching source labels and professional identifiers into the retained hit.
6. Assign each merged group to its primary source bucket and round-robin the fixed bucket order `feeds`, `pubmed`, `clinical_trials`, `fda`, `tctmd`, `massdevice`, `web` up to the 30-result cap.

A Feed-primary duplicate keeps its reader/read/saved behavior while retaining PubMed, ClinicalTrials, FDA, or other professional provenance. Fuzzy title matching is explicitly deferred because a false merge is worse than a visible duplicate.

### 12. Access, rate limiting, privacy, and external safety stay server-side

- Search uses feature key `search` in the existing `dealflow` access domain.
- Feed selection additionally requires permitted Feeds read access and the current user's Miniflux connection.
- Category configuration is readable by fund members through the Search page and writable only by the existing fund-admin boundary. Web and each professional source remain subject to the separate fund source allowlist, but no per-fund call quota or cost ledger is added.
- A per-user limit of 10 Search requests per 60 seconds is enforced before upstream calls; each source receives an 8-second deadline.
- Usage metrics contain adapter/source ID, timing, status, and result count only. Raw queries, result bodies, credentials, and cost records are not retained.
- Titles and snippets are rendered as text, never injected as HTML.
- Result URLs are restricted to validated public HTTP(S) targets; credential-bearing, local, private-network, unsafe-scheme, and adapter-off-domain targets are rejected.
- Search does not download remote thumbnails, favicons, or result-page assets.
- If results later enter an AI workflow, they remain untrusted evidence and cannot supply executable instructions.

### 13. Responsive and accessible behavior stays conventional

- Desktop uses a result column plus a category rail.
- Narrow screens place categories in a filter drawer and keep query/results primary.
- Category controls are native labeled checkboxes with keyboard-visible focus.
- Loading, unavailable, empty, partial, rate-limited, and failed states have text equivalents and live-region announcements where appropriate.
- Closing a Feed reader restores focus to the result that opened it.

## Risks / Trade-offs

- **Direct website search is fragile** -> Limit the first release to TCTMD and MassDevice, keep source-specific fixtures, validate result hosts, and disable one broken adapter without failing the search.
- **External sources dominate latency** -> Execute concurrently, cap timeouts and result counts, return partial results, and avoid detail-page fetching or pagination.
- **SearXNG engines can rate-limit or block the server** -> Use four reviewed engine families, bounded requests, health/error metrics, and no public anonymous endpoint.
- **Exact-only deduplication leaves some visible duplicates** -> Accept this to avoid false merges; stable identifiers and canonical URLs cover the reliable cases.
- **No pagination limits recall** -> Prefer query refinement and source links in the first release; add single-source continuation later only if usage data demonstrates need.
- **A code-owned adapter registry limits runtime extensibility** -> Accept this intentionally; administrators can reorganize registered adapters into categories, while new network integrations remain reviewed code changes.
- **Fund-configured categories can reference unavailable adapters** -> Preserve the configuration but intersect it with caller access, source policy, and live availability; fail closed and explain unavailable categories without turning IDs into dynamic code.

## Migration Plan

1. Keep Search disabled by default behind `dealflow.search`.
2. Confirm the Miniflux-backed Feeds capability has landed.
3. Define the category request, adapter, source-status, result, and exact merge contracts.
4. Deploy a Reporting-owned pinned SearXNG service with loopback binding, independent secret, JSON/POST configuration, healthcheck, and the fixed Web/News allowlist.
5. Implement the Miniflux Feed and SearXNG Web adapters.
6. Implement live PubMed, ClinicalTrials.gov, and FDA/openFDA 510(k) adapters; register TCTMD and MassDevice with fixture-tested parsers and unavailable-by-default transports.
7. Add fund-scoped category configuration, admin Settings API/UI, `CategoryResolver`, `AdapterRegistry`, and `AdapterExecutor`.
8. Add `POST /api/search` with category validation/resolution, bounded concurrency, partial failure, fixed result windows, access checks, rate limiting, privacy, and safe normalization.
9. Add the Search page, default category selection, unified result list, source statuses, and origin-correct actions.
10. Verify Feed-only, Web-only, every enabled professional source, combined, zero-category, timeout, malformed/off-domain HTML fixtures, duplicate, rate-limit, mobile, and keyboard flows before enabling a pilot fund.

No local index or search-history migration is part of this change. Rollback disables Search, removes its navigation entry, and stops the Reporting-owned SearXNG service; existing Miniflux subscriptions and reader state remain untouched.
