## Why

The diligence workflow currently localizes product UI but leaves non-interactive AI artifacts outside the locale contract, so every memo-agent stage defaults to English. Partners need one predictable project-level language that applies to the full diligence run without choosing a language at every stage or silently rewriting finalized work.

## What Changes

- Add a single `en` / `zh-CN` diligence output-language selection, defaulted from the validated UI locale when a deal is created.
- Persist the deal preference and snapshot it on each memo draft so background jobs, retries, and resumed stages remain deterministic even when the browser locale changes.
- Apply the snapshot to ingestion synthesis, research, checklist and Q&A narratives, expert-validation questions and synthesis, scoring rationale, memo drafting, and rendered memo prose while keeping schema keys, enums, identifiers, citations, proper nouns, and source quotations stable.
- Show one compact language control at the deal level; all stages inherit it without additional prompts.
- Allow a language change before artifacts exist, but require a new language-version draft once generated artifacts exist; finalized memo versions are never overwritten.
- Preserve existing English deals and drafts as English-compatible data without rewriting historical artifacts.

## Capabilities

### New Capabilities

- `diligence-output-language`: Defines project-level output-language selection, immutable per-draft snapshots, full-pipeline language propagation, and non-destructive language versioning.

### Modified Capabilities

None.

## Impact

- Database migrations and generated Supabase types for `diligence_deals` and `diligence_memo_drafts`.
- Diligence creation, detail, agent status, and language-version APIs and UI.
- Memo-agent prompt composition, stage loaders, job payload handling, and expert-validation generation/synthesis.
- Locale catalogs plus focused contract, integration, and browser E2E coverage.
- No new runtime dependency and no change to stable URLs, JSON schema keys, authorization domains, or finalized-memo immutability.
