## Why

Reporting can already invite an expert from a Diligence research gap, but experts are only exposed inside that workflow and funds cannot build a governed expert resource. Funds need a directory that distinguishes platform-certified experts from private fund experts, while allowing fund-led discovery without letting unverified internet results enter matching or outreach.

## What Changes

- Add an authenticated Expert Directory with Platform Certified, Fund Experts, and Discovery views.
- Preserve the existing global/fund visibility model while recording verification and provenance for every formal expert.
- Allow fund admins to add fund experts manually and to discover source-backed candidates from approved medical search adapters.
- Keep discovered people in a fund-private candidate lifecycle until a fund admin confirms or rejects them.
- Promote a confirmed candidate into a fund expert idempotently, without inventing contact details or sending an invitation.
- Extend the existing Diligence expert selector and auto-match results with origin/verification badges; candidates remain ineligible.
- Add fund-scoped authorization, input bounds, rate limiting, and audit metadata to discovery and confirmation routes.

## Capabilities

### New Capabilities

- `expert-directory-discovery`: Govern platform and fund expert resources, source-backed fund discovery, candidate review and confirmation, and consumption by the existing Diligence expert-validation workflow.

### Modified Capabilities

None.

## Impact

- Database: `experts` provenance/verification metadata and a new fund-scoped candidate table with lifecycle constraints.
- Backend: expert directory DTOs/services, discovery normalization and adapter orchestration, candidate routes, promotion, authorization, and rate limiting.
- Frontend: `/experts`, navigation/localization, candidate review, manual fund-expert creation, and Diligence expert badges/deep links.
- Integrations: reuse Reporting Search's approved-source policy and bounded API transport for PubMed and ClinicalTrials.gov expert-discovery adapters; external results remain untrusted source evidence until confirmed.
- Security/privacy: no public candidate access, no automatic invitation, no fabricated email, and no cross-fund candidate visibility.
