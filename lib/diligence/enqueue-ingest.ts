import type { SupabaseClient } from '@supabase/supabase-js'
import { kickWorker } from '@/lib/memo-agent/kick'

/**
 * Enqueue an ingest job for documents that just landed in a deal's data room
 * from an external source (Affinity sync, accepted inbound email).
 *
 * Ingesting is what turns a raw file into claims with stable ids — the thing the
 * memo cites. A document that is never ingested sits in the data room invisible
 * to every agent stage, so any importer that skips this has only half-imported.
 *
 * Scoped to the new document ids rather than a full re-ingest: a full run would
 * re-pay for every document already parsed.
 */
export async function enqueueIngestForDocuments(
  admin: SupabaseClient,
  params: { fundId: string; dealId: string; documentIds: string[]; enqueuedBy?: string | null; dedupeKey?: string }
): Promise<{ enqueued: boolean; reason?: string }> {
  if (params.documentIds.length === 0) return { enqueued: false, reason: 'no new documents' }

  // New deployments serialize this decision per Deal inside Postgres. This is
  // stronger than the old check-then-insert sequence: two different external
  // sources arriving together cannot both enqueue jobs that race on one draft.
  const atomic = await admin.rpc('enqueue_ingest_if_deal_idle', {
    p_fund_id: params.fundId,
    p_deal_id: params.dealId,
    p_document_ids: params.documentIds,
    p_enqueued_by: params.enqueuedBy ?? null,
    p_dedupe_key: params.dedupeKey ?? null,
  })
  if (!atomic.error) {
    const result = atomic.data as { enqueued?: boolean; reason?: string } | null
    if (!result?.enqueued) return { enqueued: false, reason: result?.reason ?? 'ingest was not queued' }
    await kickWorker()
    return { enqueued: true }
  }

  // The RPC is the concurrency boundary. If the migration is missing or the
  // database rejects the call, keep the document pending and fail closed rather
  // than reviving the old check-then-insert race during a rolling deploy.
  return { enqueued: false, reason: atomic.error.message }
}
