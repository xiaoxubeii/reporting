# fund-host-branding Specification

## Purpose
TBD - created by archiving change add-fund-subdomain-isolation. Update Purpose after archive.
## Requirements
### Requirement: Tenant Landing uses Fund branding on the existing root path
On a valid tenant hostname, the existing `/` Landing path SHALL render the resolved Fund's public name, logo, and safe theme while retaining the existing Landing access rule and content structure.

#### Scenario: Anonymous Fund Landing
- **WHEN** Landing is enabled and an anonymous user opens Fund A's `/`
- **THEN** the existing Landing renders with Fund A branding and no private Fund settings

### Requirement: Tenant authentication uses Fund branding on existing paths
The existing `/auth` pages on a valid tenant hostname SHALL render the resolved Fund's public name, logo, and safe theme without changing authentication methods or callback paths.

#### Scenario: Fund login page
- **WHEN** a user opens Fund A's `/auth`
- **THEN** the current login form and methods render with Fund A branding

### Requirement: GP application branding matches enforced Host Fund
The existing GP application chrome SHALL continue to render membership-derived Fund name, logo, and theme, and tenant middleware SHALL guarantee that this Fund equals the Host Fund.

#### Scenario: GP Dashboard branding
- **WHEN** a Fund A GP opens Fund A's `/dashboard`
- **THEN** the Dashboard chrome uses Fund A branding and cannot be rendered under Fund B's hostname

### Requirement: LP Portal branding matches enforced Host Fund
The existing LP Portal chrome SHALL continue to render LP-link-derived Fund name, logo, and theme, and tenant middleware SHALL guarantee that this Fund equals the Host Fund.

#### Scenario: LP Portal branding
- **WHEN** a Fund A active LP opens Fund A's `/portal/overview`
- **THEN** the Portal uses Fund A branding and cannot be rendered under Fund B's hostname
