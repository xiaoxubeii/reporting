## ADDED Requirements

### Requirement: Existing paths and access rules remain stable
Tenant hosting SHALL preserve the existing Landing, authentication, GP application, LP management, and LP Portal paths and SHALL retain the existing authentication, role, feature, grant, and LP-status rules.

#### Scenario: GP uses existing Dashboard path
- **WHEN** a valid GP member opens `/dashboard` on their Fund hostname
- **THEN** the existing Dashboard is served without adding a Fund slug to the pathname

#### Scenario: LP uses existing Portal path
- **WHEN** an active LP opens `/portal/overview` on their Fund hostname
- **THEN** the existing LP Portal is served under the existing active-LP rules

### Requirement: Hosted Host classes have explicit route admission
In tenant mode the system SHALL apply an explicit Host-class and route-authority matrix before any session initialization or handler execution; no hosted request SHALL obtain Fund authority from an unclassified or arbitrary Host.

#### Scenario: Tenant browser route
- **WHEN** a public, auth, onboarding, GP, or LP browser route is requested on a known tenant Host
- **THEN** its existing path proceeds only through the tenant-specific identity rule for that surface

#### Scenario: Platform or system route
- **WHEN** a cron, worker, webhook, discovery, or central callback route is requested
- **THEN** it proceeds only on its registered platform or reserved Host and still uses its existing token, job, or provider authentication

#### Scenario: Invalid Host reaches an early-bypass path
- **WHEN** an invalid or unknown Host requests an expert, worker, webhook, or other current middleware bypass path
- **THEN** Host classification rejects it before the bypass can execute

### Requirement: GP session must match Host Fund
Every tenant-hosted GP page and session-authenticated Fund API SHALL require the Fund resolved from Host to equal the caller's live `fund_members` Fund before applying existing domain permissions.

#### Scenario: Same-Fund GP request
- **WHEN** a Fund A member uses a valid session on Fund A's hostname and passes the existing route permission
- **THEN** the page or API proceeds using Fund A

#### Scenario: Cross-Fund GP request
- **WHEN** a Fund A member authenticates or sends a session request on Fund B's hostname
- **THEN** the request is denied before any Fund-owned page data or API handler result is returned

### Requirement: LP session must match Host Fund
Every tenant-hosted LP Portal page and session-authenticated LP API SHALL require the active LP account to resolve to exactly one Fund and SHALL require that Fund to equal the Host Fund.

#### Scenario: Same-Fund active LP
- **WHEN** an active Fund A LP opens Fund A's `/portal/overview`
- **THEN** the existing LP Portal access rules proceed

#### Scenario: Cross-Fund or ambiguous LP
- **WHEN** an LP account resolves to Fund A but requests Fund B, or resolves to more than one distinct Fund
- **THEN** the system denies the request instead of choosing an arbitrary Fund

### Requirement: One auth account resolves to one Fund across GP and LP graphs
The database and all membership/link provisioning paths SHALL prevent one auth user from resolving to more than one distinct Fund through GP membership, direct LP links, delegated LP access, or a combination of those graphs.

#### Scenario: Existing cross-Fund identity during migration
- **WHEN** migration finds an auth user associated with more than one distinct Fund across GP and LP graphs
- **THEN** migration stops with an actionable error and does not silently choose or revoke a Fund

#### Scenario: New cross-Fund LP link or delegation
- **WHEN** a write would associate an existing Fund A auth user with Fund B through a direct LP link, delegation, activation, or GP membership
- **THEN** the database rejects the write while still allowing multiple investor links inside Fund A

### Requirement: Host-only browser session
Tenant-hosted authentication SHALL keep session cookies scoped to the exact hostname and SHALL still validate Host/Fund membership after successful authentication.

#### Scenario: Session is not shared to sibling Fund
- **WHEN** a user signs in on Fund A's hostname and later opens Fund B's hostname
- **THEN** Fund A's browser session cookie is not sent to Fund B

#### Scenario: Fund A credentials entered on Fund B
- **WHEN** valid Fund A credentials are entered on Fund B's authentication page
- **THEN** the newly authenticated session is rejected, signed out, and cleared on Fund B before returning to `/auth`, and cannot access Fund A or Fund B data through that hostname

### Requirement: Tenant onboarding is fixed to the Host Fund
Tenant-hosted signup and onboarding SHALL preserve existing whitelist, email verification, invitation, approval, and email-domain rules while preventing the caller from creating or selecting a different Fund.

#### Scenario: Tenant join request
- **WHEN** a newly verified user on Fund A's hostname qualifies under the existing join rules
- **THEN** onboarding can request or activate access only for Fund A regardless of a client-supplied Fund ID

#### Scenario: Tenant attempts Fund creation
- **WHEN** a caller invokes the new-Fund creation path on a tenant hostname
- **THEN** the request is denied without creating a Fund

#### Scenario: Platform or legacy Fund creation
- **WHEN** a qualified user creates a Fund on the platform root or in legacy self-host mode
- **THEN** the existing creation rules apply and tenant mode returns the new Fund's canonical hostname without changing the creation path

### Requirement: Non-session credentials bind to Host Fund
Public Fund tokens, API keys, OAuth/MCP credentials, and signed resource access used on a tenant hostname SHALL resolve a persisted Fund and SHALL require it to equal the Host Fund.

#### Scenario: Public submission token on correct hostname
- **WHEN** a Fund A public submission token is used on Fund A's existing submission path
- **THEN** the existing token and feature checks proceed

#### Scenario: Public or API token on wrong hostname
- **WHEN** a Fund A public token, API key, OAuth token, MCP token, or signed Fund resource is used on Fund B's hostname
- **THEN** the system returns a non-disclosing denial and performs no Fund B or Fund A mutation

### Requirement: Service-role operations retain explicit Fund fences
Every tenant-hosted route that uses a service-role client SHALL derive its authorized Fund from trusted identity and Host context and SHALL include that Fund in resource reads and writes.

#### Scenario: Cross-Fund resource identifier
- **WHEN** a Fund A caller supplies a valid Fund B resource ID to a service-role route on Fund A's hostname
- **THEN** the resource lookup or mutation returns no usable resource and does not bypass RLS through service-role authority

### Requirement: System jobs and inbound webhooks preserve non-Host authority
Background jobs and verified inbound webhooks SHALL run only on registered platform/internal/hook Hosts, SHALL continue to derive Fund identity from signed tokens, persisted jobs, provider credentials, or destination configuration, and SHALL NOT infer Fund identity from Host.

#### Scenario: Background worker request
- **WHEN** a worker presents a valid exact-audience Job Token on the configured internal/platform origin
- **THEN** the worker restores the persisted job Fund and applies existing cross-Fund and revocation checks

#### Scenario: Webhook with spoofed Host
- **WHEN** an inbound provider webhook has a tenant, invalid, or unregistered Host despite valid provider authentication
- **THEN** the request is denied before Fund selection; on the registered hook Host Fund selection follows the verified provider/destination contract

### Requirement: Legacy mode preserves existing authorities and links
When tenant hosting is not configured, the system SHALL preserve existing hostname behavior, GP/LP access, public tokens, links, OAuth callbacks, workers, and webhooks.

#### Scenario: Legacy session and link generation
- **WHEN** `FUND_WORKSPACE_ROOT_DOMAIN` is absent
- **THEN** existing paths resolve Fund from current identity and generated links continue to use existing configured application or site origins

### Requirement: Tenant caches do not cross Funds
Every cached tenant descriptor or tenant-branded response SHALL include the normalized Fund slug or Fund ID in its cache identity.

#### Scenario: Consecutive Fund landing requests
- **WHEN** Fund A Landing is rendered and Fund B Landing is requested afterwards
- **THEN** Fund B never receives Fund A's name, logo, theme, or cached private data

### Requirement: Canonical Fund links use persisted tenant identity
Fund-facing links generated by the server SHALL use the persisted Fund slug and configured root domain rather than echoing an untrusted request Host.

#### Scenario: Fund email link
- **WHEN** the system sends a Fund A invitation, submission, expert, LP, or approval link
- **THEN** the link uses Fund A's canonical tenant origin and its existing path
