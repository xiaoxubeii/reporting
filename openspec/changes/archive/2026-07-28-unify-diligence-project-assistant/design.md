## Context

The application has one global Assistant with private persistent threads and several page-specific scopes. Diligence separately retained an embedded Q&A chat backed by `diligence_qa_chats`. The two surfaces created inconsistent interaction, history, citations, permissions, and page layouts. Diligence material is sensitive and multi-tenant, while CRM relationships and shared memo evidence have permissions distinct from diligence read access.

## Goals / Non-Goals

**Goals:**

- Make the global Assistant the only active project-question surface.
- Bind project scope on every page below a diligence project.
- Preserve new private history and display legacy history without implying it remains writable.
- Reuse the existing evidence-grounded answer path and validated document citations.
- Keep generic, company, deal, accounting, LP, and pipeline Assistant behavior unchanged.
- Prevent direct Data API bypass, client-forged history, prompt injection, CRM permission bleed, and lost evidence updates.
- Preserve Assistant-derived answers as auditable secondary artifacts without automatically treating them as investment evidence.

**Non-Goals:**

- Rebuilding the Assistant as a separate diligence-only component.
- Migrating legacy rows into mutable new conversations.
- Treating model output as primary source material.
- Replacing JSONB Q&A storage with a normalized evidence table in this change.

## Decisions

1. **Scope the existing Assistant instead of adding a second host.** Diligence pages report `{domain: diligence, diligenceDealId}` to the shared context. The server derives the exact `diligence:<uuid>` conversation scope and verifies Fund ownership and live access. This preserves one UI and one generic capability registry.

2. **Use server-owned history.** New turns accept only the newest user message. Existing assistant turns and citations are restored from a conversation verified by Fund, owner, and exact scope. `analyst_conversations` is server-only through Data API grants, with owner-only RLS as defense in depth.

3. **Keep legacy history read-only.** Legacy rows are returned through a bounded GET-only compatibility adapter. The input is disabled while viewing this history; users explicitly start a new project conversation.

4. **Separate permission domains.** Project answering requires diligence read. Affinity additionally requires live `relationships:read` for both `interactions` and `notes`, an asking-user credential belonging to the exact Fund, and an Affinity organization already linked to the current project. Project mode exposes notes/files only and rejects model-supplied organization IDs outside that binding. Promotion to shared draft artifacts requires diligence write and successful private-history persistence.

5. **Archive derived answers conservatively.** Only cited data-room-grounded answers are eligible. They are tagged `assistant_derived`, `unverified`, and `excluded`, retain requester, conversation, model, time, and citations, and do not feed Q&A context, memo drafting, or scoring until explicitly included. Answers that used CRM tools are not promoted because tool-name-only provenance is insufficient.

6. **Serialize every Q&A JSONB mutation.** Append, session replacement, include/exclude, and delete operations use service-role-only `SECURITY DEFINER` functions with exact Fund/deal/draft checks and `FOR UPDATE`. Functions use an empty search path, qualified tables, bounded input, and revoked public execution.

7. **Render assistant Markdown defensively.** Remote images are blocked and links are restricted to HTTP(S)/mailto with safe window isolation.

8. **Append conversations atomically.** Existing threads use a service-role-only compare-and-swap RPC that locks the exact Fund/user/scope row, verifies its expected message count, and appends only the new user/assistant pair. Project threads carry a server trust marker; pre-marker project rows cannot be continued. A stale concurrent request returns the generated answer as unsaved and cannot create orphan shared evidence.

9. **Bound and serialize the full Q&A lifecycle.** Every Q&A JSON endpoint reads the actual request stream under a byte ceiling, and answer limits account for UTF-8 bytes and aggregate serialized size rather than JavaScript character count alone. Each active session is bound to one exact memo draft; historical sessions without that binding remain readable as history but cannot receive new lifecycle writes. Session start, AI batch append, Partner answer append, and completion all share the deal-scoped transaction lock used by draft-version creation and refuse a non-authoritative draft at the short database write boundary. AI and Partner appends then lock the exact Fund/deal/draft/active-QA-session row; AI batch append also compares the message count read before model invocation, so a stale result conflicts rather than repeating questions. Completion snapshots the latest answers under that draft-bound session lock, persists them under capacity limits that cover both session and external evidence, closes the session, and advances the stage in one transaction. Every lifecycle route rechecks live diligence write access. Affinity linking and imports use the same live diligence/relationships authorization boundary as project answering.

## Risks / Trade-offs

- **[Risk] JSONB remains a shared mutable document.** → All current writers use one row-lock protocol; normalize Q&A into a row-per-evidence table in a later migration.
- **[Risk] Existing stored assistant messages predate server-owned history validation.** → Project conversations require a server trust marker; pre-marker project threads must restart. Legacy diligence data remains separately labeled and read-only.
- **[Risk] Conversation persistence can fail after model generation.** → Return the answer with a visible unsaved warning and never promote it into shared evidence.
- **[Risk] Multiple Partners may answer the same Q&A session concurrently.** → Append each response batch in a row-locking database function rather than replacing the complete message array.
- **[Risk] Revoking browser Data API grants could break an unknown direct consumer.** → Current repository consumers use server/admin clients; deploy migration with route smoke tests and roll back grants if an external integration is discovered.

## Migration Plan

1. Deploy application code that reads/writes conversations and evidence through server routes.
2. Apply atomic evidence RPC migration.
3. Apply server-only grants, owner-only conversation RLS, and atomic conversation-append migrations.
4. Verify authenticated direct Data API access is denied, stale appends fail closed, and service routes still work.
5. Roll back by restoring the previous grants and policies only if an undiscovered direct consumer is confirmed; keep API ownership checks in place.

## Open Questions

- A future change should normalize `qa_answers` and add an explicit review/audit event table for derived-evidence inclusion decisions.
