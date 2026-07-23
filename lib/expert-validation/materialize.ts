import { createAdminClient } from '@/lib/supabase/admin'
import type { Json, Tables } from '@/lib/types/database'
import { enqueueIngestForDocuments } from '@/lib/diligence/enqueue-ingest'

type Admin = ReturnType<typeof createAdminClient>
type RequestRow = Tables<'diligence_expert_requests'>
type DocumentRow = Pick<Tables<'diligence_documents'>, 'id' | 'fund_id' | 'deal_id' | 'source_kind' | 'parse_status'>

export async function materializeExpertResponse(params: {
  admin: Admin
  requestId: string
  enqueuedBy?: string | null
}): Promise<{ documentId: string; enqueued: boolean; reason?: string }> {
  const { data, error } = await params.admin
    .from('diligence_expert_requests')
    .select('*')
    .eq('id', params.requestId)
    .eq('status', 'submitted')
    .maybeSingle()
  if (error) throw error
  const request = data
  if (!request?.response_markdown || !request.submitted_at) throw new Error('Submitted expert response not found')

  const storagePath = `${request.deal_id}/expert-validation/${request.id}.md`
  const markdown = buildExpertEvidenceMarkdown(request)
  await ensureImmutableObject(params.admin, storagePath, markdown)

  let document: DocumentRow | null = null
  const { data: existing, error: existingError } = await params.admin
    .from('diligence_documents')
    .select('id, fund_id, deal_id, source_kind, parse_status')
    .eq('storage_path', storagePath)
    .maybeSingle()
  if (existingError) throw existingError
  document = existing
  if (!document) {
    const { data: created, error: createError } = await params.admin
      .from('diligence_documents')
      .insert({
        fund_id: request.fund_id,
        deal_id: request.deal_id,
        storage_path: storagePath,
        file_name: `expert-validation-${request.id}.md`,
        file_format: 'md',
        file_size_bytes: Buffer.byteLength(markdown, 'utf8'),
        detected_type: 'industry_expert',
        type_confidence: 'high',
        parse_status: 'pending',
        source_kind: 'industry_expert',
        uploaded_by: null,
      })
      .select('id, fund_id, deal_id, source_kind, parse_status')
      .maybeSingle()
    if (createError) {
      const recovered = await params.admin.from('diligence_documents').select('id, fund_id, deal_id, source_kind, parse_status').eq('storage_path', storagePath).maybeSingle()
      if (recovered.error || !recovered.data) throw createError
      document = recovered.data
    } else document = created
  }
  if (!document) throw new Error('Evidence document could not be created')
  if (document.fund_id !== request.fund_id || document.deal_id !== request.deal_id || document.source_kind !== 'industry_expert') {
    throw new Error('Existing evidence document is outside the expert request scope')
  }

  if (!request.document_id) {
    const { error: linkError } = await params.admin
      .from('diligence_expert_requests')
      .update({ document_id: document.id, materialization_error: null })
      .eq('id', request.id)
      .is('document_id', null)
    if (linkError) throw linkError
  } else if (request.document_id !== document.id) {
    throw new Error('Expert request is linked to a different evidence document')
  }

  if (document.parse_status === 'parsed') return { documentId: document.id, enqueued: false, reason: 'already parsed' }
  const ingest = await enqueueIngestForDocuments(params.admin, {
    fundId: request.fund_id,
    dealId: request.deal_id,
    documentIds: [document.id],
    enqueuedBy: params.enqueuedBy ?? request.created_by ?? null,
    dedupeKey: `expert-validation:${request.id}`,
  })
  return { documentId: document.id, ...ingest }
}

export function buildExpertEvidenceMarkdown(row: Pick<RequestRow, 'id' | 'submitted_at' | 'question' | 'context_snapshot' | 'response_markdown' | 'expert_snapshot'> & { expert_email?: string | null }): string {
  const snapshot = jsonObject(row.expert_snapshot)
  const identity = [snapshot.name, snapshot.title, snapshot.organization].filter(Boolean).join(' — ') || 'External industry expert'
  return `# Expert validation response

Request ID: ${row.id}
Submitted at: ${row.submitted_at}
Expert: ${identity}

## Validation question

${row.question}

## Context provided to the expert

${row.context_snapshot}

## Expert response

${row.response_markdown}
`
}

function jsonObject(value: Json | null): Record<string, Json | undefined> {
  return value && !Array.isArray(value) && typeof value === 'object' ? value : {}
}

async function ensureImmutableObject(admin: Admin, path: string, content: string): Promise<void> {
  const bytes = Buffer.from(content, 'utf8')
  const upload = await admin.storage.from('diligence-documents').upload(path, bytes, {
    contentType: 'text/markdown; charset=utf-8',
    upsert: false,
  })
  if (!upload.error) return
  const existing = await admin.storage.from('diligence-documents').download(path)
  if (existing.error || !existing.data) throw upload.error
  const existingText = await existing.data.text()
  if (existingText !== content) throw new Error('Existing expert evidence object does not match the immutable response')
}

export async function recordMaterializationError(admin: Admin, requestId: string, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : 'Evidence processing failed').slice(0, 1000)
  await admin.from('diligence_expert_requests').update({ materialization_error: message }).eq('id', requestId)
}
