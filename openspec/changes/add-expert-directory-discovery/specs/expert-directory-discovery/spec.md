## ADDED Requirements

### Requirement: Formal experts have explicit trust and visibility
The system SHALL expose platform-certified experts to every authorized fund and fund-confirmed experts only to members of their owning fund, with explicit verification and source labels.

#### Scenario: Fund member views the directory
- **WHEN** an authorized fund member opens the Expert Directory
- **THEN** the system lists active platform-certified experts and experts owned by that member's fund without returning another fund's experts

#### Scenario: Trust label is shown
- **WHEN** an expert is rendered in the directory or Diligence expert selector
- **THEN** the system labels it as Platform Certified or Fund Expert and identifies manual or discovery provenance for a fund expert

### Requirement: Fund admins can manually manage fund experts
The system SHALL allow a fund admin to create, edit, activate, and deactivate a fund expert while preventing that workflow from creating or modifying a platform-certified expert.

#### Scenario: Admin creates a fund expert
- **WHEN** a fund admin submits valid identity, contact, and profile fields through the Fund Experts view
- **THEN** the system creates a fund-scoped, fund-confirmed, manual expert owned by that admin's fund

#### Scenario: Non-admin attempts a write
- **WHEN** a non-admin fund member attempts to create or modify a fund expert
- **THEN** the system rejects the write without changing expert data

### Requirement: Fund admins can discover source-backed candidates
The system SHALL let a fund admin run a bounded expert discovery query against enabled, approved medical discovery adapters, persist normalized candidates with source evidence, and return per-source outcome status for that discovery request.

#### Scenario: Successful multi-source discovery
- **WHEN** an admin submits a valid query and PubMed or ClinicalTrials.gov returns identifiable people
- **THEN** the system returns and persists fund-private pending candidates with the source record title, stable identifier, URL, and matching profile evidence

#### Scenario: Partial upstream failure
- **WHEN** one approved source fails or times out while another source succeeds
- **THEN** the system returns the successful candidates together with a partial source status and does not convert the failure into a formal expert

#### Scenario: Contact is absent
- **WHEN** an upstream source does not return an explicit email address
- **THEN** the candidate remains discoverable with a null email and the system does not infer or fabricate one

### Requirement: Discovery candidates are isolated and reviewable
The system SHALL store discovery candidates separately from formal experts, scope every candidate to one fund, and support pending, confirmed, and rejected lifecycle states.

#### Scenario: Candidate is not eligible
- **WHEN** a candidate remains pending or is rejected
- **THEN** it is absent from expert directory matching, automatic matching, selection, and invitation results

#### Scenario: Cross-fund candidate access
- **WHEN** a user attempts to read or mutate a candidate belonging to another fund
- **THEN** the system returns no candidate and makes no change

#### Scenario: Repeated discovery
- **WHEN** a fund repeats a query that finds an existing candidate identity
- **THEN** the system updates bounded source evidence idempotently without creating a duplicate or reviving a rejected candidate

### Requirement: Fund confirmation atomically promotes a candidate
The system SHALL require fund-admin confirmation and an explicit valid email before atomically promoting a pending candidate into a fund-confirmed discovery expert.

#### Scenario: Confirm a pending candidate
- **WHEN** the owning fund admin reviews a candidate, supplies any required contact details, and confirms it
- **THEN** one fund expert is created and the candidate is atomically marked confirmed and linked to that expert

#### Scenario: Repeat confirmation
- **WHEN** the same confirmed candidate is submitted again
- **THEN** the system returns the existing linked expert without creating a duplicate

#### Scenario: Reject a candidate
- **WHEN** the owning fund admin rejects a pending candidate
- **THEN** the candidate is retained as rejected for audit and cannot be promoted unless a later explicit review reopens it

### Requirement: Existing expert validation consumes only formal experts
The system SHALL continue to search and auto-match active platform experts plus active experts owned by the current fund, and SHALL include verification/provenance metadata in those results.

#### Scenario: Confirmed discovery expert becomes available
- **WHEN** a candidate has been confirmed into an active fund expert
- **THEN** it appears in manual expert search and can appear in semantic matching after its embedding is available

#### Scenario: Platform expert is selected
- **WHEN** a fund selects an active platform-certified expert for a draft validation request
- **THEN** the existing selection and invitation lifecycle proceeds while snapshotting the expert identity and trust metadata

### Requirement: Discovery and confirmation are bounded and non-outreaching
The system SHALL validate same-origin JSON requests, enforce strict query/result/content bounds and shared rate limits, and SHALL never automatically invite or contact a discovered candidate.

#### Scenario: Discovery rate limit is exceeded
- **WHEN** a user exceeds the configured discovery rate
- **THEN** the system returns a retryable rate-limit response without calling external sources

#### Scenario: Candidate is confirmed
- **WHEN** a candidate is promoted into the Expert Directory
- **THEN** no invitation is sent until a fund member separately confirms an existing Diligence expert request invitation

### Requirement: Expert Directory supports the complete first-release workflow
The system SHALL provide responsive authenticated views for Platform Certified experts, Fund Experts, and Discovery, including search, empty/error/partial states, manual creation, candidate review, confirmation, and rejection.

#### Scenario: Directory has no fund experts
- **WHEN** a fund has no fund experts
- **THEN** the Fund Experts view explains how to add one manually or start Discovery without hiding available platform experts

#### Scenario: Discovery candidate is confirmed in the UI
- **WHEN** an admin confirms a candidate from the Discovery view
- **THEN** the candidate is shown as confirmed and the resulting expert is immediately visible in Fund Experts and usable from Diligence
