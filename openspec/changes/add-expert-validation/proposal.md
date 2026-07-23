## Why

Research can identify gaps and contradictions, but reporting currently has no way to obtain a scoped external expert answer and return that answer to the existing evidence pipeline. The change should close that loop without adding a second Research pipeline, a separate validation result model, Research output versioning, or a mandatory internal review step.

## What Changes

- Add an expert-validation request that starts from an existing Research gap or contradiction.
- Generate and persist only the agreed validation inputs: one focused question, one expert profile, and a snapshot of the supporting sanitized context; the internal user confirms or edits them before invitation.
- Add a reporting-owned expert directory whose entries are either global or private to one fund.
- Allow an authorized fund member either to select an eligible expert manually or to request a Top 5 semantic match from the sanitized validation question plus desired expert profile, with final selection remaining manual.
- Keep semantic retrieval inside the existing Supabase/Postgres boundary by using `pgvector` exact cosine search; do not add a separate vector database, approximate vector index, LLM reranker, persisted candidate runs, or runtime multi-model migration in the first version.
- Allow a selected expert to receive a narrowly scoped invitation and submit one bounded response without becoming a fund member or LP user.
- Send the invitation through reporting's existing fund-configured outbound email layer. The email contains a fragment-token response link but no Deal-sensitive question or context.
- Isolate the public response route from analytics and third-party scripts, clear the fragment token before application code runs, and prevent caching of the page and token-scoped responses.
- On successful submission, automatically and idempotently materialize the immutable response as an `industry_expert` document and enqueue it through the existing incremental Ingest flow; do not add Accept/Reject or another evidence approval state.
- Treat the expert response as untrusted external evidence when building AI prompts so document content cannot act as model instructions.
- After Ingest synthesis and checklist reassessment, continue to use the existing full Research action to recompute the current `research_output`; do not add an expert-specific Research branch, Research output versions, or a new expert-evidence freshness calculation in the first version.
- Do not create or synchronize Diligence Attention items for expert validation.

## Capabilities

### New Capabilities

- `expert-validation`: Maintain a minimal global/fund expert directory; select an expert manually or through exact semantic Top K matching; and invite, collect, materialize, and ingest a scoped expert response while reusing the current Diligence document, Ingest, Research, Scoring, and Memo pipeline.

### Modified Capabilities

None.

## Impact

- Adds a reporting-owned expert directory with global and fund-private entries, plus a fund- and deal-scoped expert-validation persistence model and internal APIs/UI on the existing Research surface.
- Adds manual directory selection and server-side `pgvector` exact cosine Top K matching. Automatic matching recommends candidates only; an authorized fund member confirms one expert before invitation.
- Adds server-side embedding generation when an expert profile changes and when a user requests automatic matching, using one fixed deployment model and vector dimension in the first version.
- Adds a fragment-token external response surface with no access to the rest of the Deal or fund, one atomic submission, no expert account or session, no analytics, and no cacheable sensitive response.
- Reuses `diligence_documents`, the `industry_expert` type, `enqueueIngestForDocuments`, `ingest_synthesis`, checklist assessment, and the current Research rerun action.
- Reuses the outbound email provider layer for invitations, but not LP accounts, LP invitations, Diligence Q&A, or fund membership.
- Reuses Supabase/Postgres for expert records, access filtering, and embeddings; no ClinMono adapter or independent vector database is introduced.
