# fund-host-resolution Specification

## Purpose
TBD - created by archiving change add-fund-subdomain-isolation. Update Purpose after archive.
## Requirements
### Requirement: Stable canonical Fund slug
Every Fund SHALL have a non-null, globally unique, lowercase DNS-safe slug that is independent of later Fund name changes.

#### Scenario: Existing Fund is backfilled
- **WHEN** the tenant migration is applied to an existing Fund
- **THEN** the Fund receives a valid deterministic slug without changing its ID, name, membership, or business data

#### Scenario: Fund name changes
- **WHEN** an administrator changes a Fund display name
- **THEN** its canonical slug remains unchanged

### Requirement: Exact supported-host classification
When tenant hosting is configured, the system SHALL classify only the configured platform root, explicitly reserved system hosts, and exactly one valid tenant label beneath the configured root; every other hostname SHALL fail closed.

#### Scenario: Valid tenant hostname
- **WHEN** the canonical request hostname is `alpha.fundworkspace.com` and the configured root is `fundworkspace.com`
- **THEN** the resolver returns tenant slug `alpha`

#### Scenario: Attacker-controlled suffix
- **WHEN** the hostname is `alpha.fundworkspace.com.evil.example`
- **THEN** the resolver rejects the hostname rather than resolving Fund `alpha`

#### Scenario: Reserved tenant label
- **WHEN** a request or Fund creation attempts to use a reserved label such as `api`, `auth`, `admin`, `hooks`, `internal`, `www`, or `fundworkspace`
- **THEN** the system rejects it as a tenant slug

#### Scenario: Tenant mode is not configured
- **WHEN** `FUND_WORKSPACE_ROOT_DOMAIN` is absent
- **THEN** the application preserves its existing self-host hostname behavior and does not require a tenant slug

### Requirement: Minimal public Fund resolution
The system SHALL resolve an exact valid slug to only the public Fund descriptor required for branding and Host/Fund comparison, without granting anonymous access to private Fund settings or membership data.

#### Scenario: Known public Fund slug
- **WHEN** an anonymous request resolves an existing Fund slug
- **THEN** the resolver returns only its ID, slug, display name, logo, and safe theme fields

#### Scenario: Unknown Fund slug
- **WHEN** an anonymous request resolves a nonexistent Fund slug
- **THEN** the application returns a uniform not-found response without exposing private settings or membership information

### Requirement: Trusted downstream tenant context
The middleware SHALL remove caller-supplied internal tenant headers and SHALL create downstream tenant context only from a validated request hostname.

#### Scenario: Forged tenant header
- **WHEN** a caller sends an internal tenant header naming Fund B while requesting Fund A's canonical hostname
- **THEN** downstream code receives only Fund A's trusted slug or the request is rejected
