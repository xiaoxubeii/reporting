# Service-role and Storage Fund-boundary audit

## Invariant

In hosted mode, middleware first resolves the canonical tenant Host and requires the GP or LP identity to resolve to the same Fund. A route using the service-role client must then derive its resource scope from that authorized Fund or from a provider/token record that persists `fund_id`; a client-supplied resource ID or Storage key is never sufficient authority.

## Reviewed surfaces

| Surface | Persisted Fund fence | Storage-key fence |
|---|---|---|
| Company documents and summaries | Company/document reads and mutations resolve through the authenticated membership Fund; document deletion now also filters both lookup and delete by `writeCheck.fundId` | Upload registration requires `<fund_id>/<company_id>/`; delete/download paths come only from the Fund-scoped document row |
| Diligence documents, Affinity imports, memo ingest/render/transcription | Deal and document reads include the authorized or persisted job `fund_id` before service-role access | Signed upload paths are server-minted after the deal/Fund check; later downloads/removals use only that Fund-scoped document row |
| LP documents, previews, sends, statements, and Portal downloads | GP routes use `fund_id`; LP middleware requires `resolve_my_lp_fund() = Host Fund`, then document access is proven through same-Fund investor/share rows | GP upload paths are prefixed by Fund; signed downloads use paths from the authorized document row and reject sample keys |
| Style anchors | Every row lookup/mutation includes the caller Fund | Signed upload and registration paths require the caller's `<fund_id>/` prefix |
| Deal submission and expert-response public resources | Token resolution yields a persisted Fund and now must equal the trusted tenant Host | Materialization keys are generated from the token-authorized Fund/deal and persisted on a Fund-scoped document row |
| Inbound email and attachments | Provider alias/token resolution supplies the persisted Fund; hosted requests are admitted only on platform/`hooks` system hosts | Attachment keys are server-generated from the newly persisted email ID; user downloads first load that email with the caller `fund_id` and re-check the email-key prefix |
| Background workers and provider webhooks | Job/token/provider records remain authoritative for `fund_id`; tenant Hosts cannot invoke these routes | Worker Storage paths are obtained only from Fund-scoped job/deal/document records |

`lib/diligence/upload-document.ts` is a browser helper that can only upload with a server-minted signed token. `hydrateAttachments()` receives payloads loaded from a Fund-scoped email row or a just-authenticated provider ingest; it does not accept a public Storage path endpoint.

## Shared infrastructure decision

Buckets and the service-role credential remain shared. Isolation is logical: Host/identity equality at middleware, explicit `fund_id` predicates at service-role resource boundaries, and server-derived or Fund-prefixed Storage paths. This change does not create per-Fund schemas, buckets, or credentials.
