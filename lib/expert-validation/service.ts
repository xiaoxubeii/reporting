import { createAdminClient } from '@/lib/supabase/admin'
import type { Json, Tables } from '@/lib/types/database'
import { createExpertEmbedding, EXPERT_EMBEDDING_MODEL, vectorLiteral } from './embedding'
import type {
  ExpertDirectoryEntry,
  ExpertIdentitySnapshot,
  ExpertMatch,
  ExpertSelectionMethod,
  ExpertSourceRef,
  ExpertValidationRequest,
} from './types'
import { buildSourceRef, parseSourceLocator } from './validation'

type Admin = ReturnType<typeof createAdminClient>
type ExpertRow = Tables<'experts'>
type RequestRow = Tables<'diligence_expert_requests'> & {
  evidence_parse_status?: string | null
  diligence_documents?: { parse_status: string } | null
}
type ResearchRow = { id: string; research_output: Json | null }

export function toDirectoryEntry(row: Pick<ExpertRow, 'id' | 'scope' | 'name' | 'title' | 'organization' | 'profile_text' | 'status' | 'embedding' | 'verification_type' | 'source_type' | 'verified_at'>): ExpertDirectoryEntry {
  return {
    id: row.id,
    scope: row.scope as ExpertDirectoryEntry['scope'],
    name: row.name,
    title: row.title ?? null,
    organization: row.organization ?? null,
    profileText: row.profile_text,
    status: row.status as ExpertDirectoryEntry['status'],
    hasEmbedding: Boolean(row.embedding),
    verificationType: row.verification_type as ExpertDirectoryEntry['verificationType'],
    sourceType: row.source_type as ExpertDirectoryEntry['sourceType'],
    verifiedAt: row.verified_at ?? null,
  }
}

export function toExpertRequest(row: RequestRow): ExpertValidationRequest {
  return {
    id: row.id,
    fundId: row.fund_id,
    dealId: row.deal_id,
    sourceKind: row.source_kind as ExpertValidationRequest['sourceKind'],
    sourceRef: row.source_ref as unknown as ExpertValidationRequest['sourceRef'],
    question: row.question,
    expertProfile: row.expert_profile,
    contextSnapshot: row.context_snapshot,
    expertId: row.expert_id ?? null,
    selectionMethod: row.selection_method as ExpertValidationRequest['selectionMethod'],
    expertSnapshot: row.expert_snapshot as unknown as ExpertValidationRequest['expertSnapshot'],
    status: row.status as ExpertValidationRequest['status'],
    invitedAt: row.invited_at ?? null,
    expiresAt: row.expires_at ?? null,
    emailProviderAcceptedAt: row.email_provider_accepted_at ?? null,
    emailThreadId: row.email_thread_id ?? null,
    emailErrorMessage: row.email_error_message ?? null,
    submittedAt: row.submitted_at ?? null,
    documentId: row.document_id ?? null,
    evidenceStatus: row.evidence_parse_status ?? row.diligence_documents?.parse_status ?? null,
    materializationError: row.materialization_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listExperts(
  admin: Admin,
  fundId: string,
  search = '',
  options: Readonly<{ includeInactiveFund?: boolean }> = {},
): Promise<ExpertDirectoryEntry[]> {
  let query = admin
    .from('experts')
    .select('id, scope, name, title, organization, profile_text, status, embedding, verification_type, source_type, verified_at')
    .or(`scope.eq.global,fund_id.eq.${fundId}`)
    .order('name')
    .limit(250)
  query = options.includeInactiveFund
    ? query.or(`status.eq.active,and(scope.eq.fund,fund_id.eq.${fundId},status.eq.inactive)`)
    : query.eq('status', 'active')
  const { data, error } = await query
  if (error) throw error
  const needle = search.trim().toLocaleLowerCase()
  return (data ?? [])
    .filter(row => !needle || [row.name, row.title, row.organization, row.profile_text]
      .some(value => typeof value === 'string' && value.toLocaleLowerCase().includes(needle)))
    .map(toDirectoryEntry)
}

export async function saveExpert(params: {
  admin: Admin
  fundId: string
  userId: string
  expertId?: string
  allowGlobalWrite?: boolean
  input: {
    scope: 'global' | 'fund'
    name: string
    email: string
    title: string | null
    organization: string | null
    profileText: string
    status: 'active' | 'inactive'
  }
}): Promise<{ expert: ExpertDirectoryEntry; embeddingWarning?: string }> {
  const { admin, fundId, input } = params
  let existing: ExpertRow | null = null
  if (params.expertId) {
    const result = await admin.from('experts').select('*').eq('id', params.expertId).maybeSingle()
    if (result.error) throw result.error
    existing = result.data
    if (!existing || (existing.scope === 'fund' && existing.fund_id !== fundId)) throw new Error('Expert not found')
    if (existing.scope === 'global' && !params.allowGlobalWrite) throw new Error('Expert not found')
    if (existing.scope !== input.scope) throw new Error('Expert scope cannot be changed')
  }

  if (input.scope === 'global' && !params.allowGlobalWrite) throw new Error('Expert not found')

  const profileChanged = !existing || existing.profile_text !== input.profileText
  let embedding: string | null = existing?.embedding ?? null
  let embeddingModel: string | null = existing?.embedding_model ?? null
  let embeddingWarning: string | undefined
  if (profileChanged) {
    try {
      embedding = vectorLiteral(await createExpertEmbedding(admin as never, fundId, input.profileText))
      embeddingModel = EXPERT_EMBEDDING_MODEL
    } catch {
      embedding = null
      embeddingModel = null
      embeddingWarning = 'Profile saved, but automatic matching is unavailable until an embedding can be generated.'
    }
  }
  const values = {
    scope: input.scope,
    fund_id: input.scope === 'fund' ? fundId : null,
    name: input.name,
    email: input.email,
    title: input.title,
    organization: input.organization,
    profile_text: input.profileText,
    status: input.status,
    verification_type: input.scope === 'global' ? 'platform_certified' : 'fund_confirmed',
    // Source identifies how the person entered this fund's directory. A later
    // fund review refreshes the attestation without rewriting that history.
    source_type: existing?.source_type ?? (input.scope === 'global' ? 'platform' : 'manual'),
    verified_at: new Date().toISOString(),
    verified_by: params.userId,
    provenance_snapshot: existing?.provenance_snapshot ?? {},
    embedding,
    embedding_model: embeddingModel,
    ...(!existing ? { created_by: params.userId } : {}),
  }
  const query = existing
    ? admin.from('experts').update(values).eq('id', existing.id)
    : admin.from('experts').insert(values)
  const { data, error } = await query
    .select('id, scope, name, title, organization, profile_text, status, embedding, verification_type, source_type, verified_at')
    .single()
  if (error) throw error
  return { expert: toDirectoryEntry(data), embeddingWarning }
}

export async function matchExperts(params: {
  admin: Admin
  fundId: string
  question: string
  expertProfile: string
}): Promise<ExpertMatch[]> {
  const queryText = `Validation question:\n${params.question}\n\nRequired expert profile:\n${params.expertProfile}`
  const embedding = await createExpertEmbedding(params.admin as never, params.fundId, queryText)
  const { data, error } = await params.admin.rpc('match_experts', {
    p_fund_id: params.fundId,
    p_query_embedding: vectorLiteral(embedding),
    p_match_count: 5,
  })
  if (error) throw error
  return (data ?? []).map(row => ({
    ...toDirectoryEntry({ ...row, status: 'active', embedding: 'matched' }),
    similarity: Number(row.similarity),
  }))
}

export async function selectExpert(params: {
  admin: Admin
  fundId: string
  dealId: string
  requestId: string
  expertId: string
  selectionMethod: ExpertSelectionMethod
}): Promise<ExpertValidationRequest> {
  const { data: expert, error: expertError } = await params.admin
    .from('experts')
    .select('id, scope, fund_id, name, email, title, organization, profile_text, status, verification_type, source_type, verified_at, verified_by')
    .eq('id', params.expertId)
    .maybeSingle()
  if (expertError) throw expertError
  const row = expert
  const eligible = row && row.status === 'active' && (
    (row.scope === 'global' && row.verification_type === 'platform_certified'
      && row.source_type === 'platform' && Boolean(row.verified_at))
    || (row.scope === 'fund' && row.fund_id === params.fundId
      && row.verification_type === 'fund_confirmed' && Boolean(row.verified_at) && Boolean(row.verified_by))
  )
  if (!eligible || !row) {
    throw new Error('Expert not found')
  }
  const snapshot: ExpertIdentitySnapshot = {
    name: row.name,
    title: row.title ?? null,
    organization: row.organization ?? null,
    profileText: row.profile_text,
    verificationType: row.verification_type as ExpertIdentitySnapshot['verificationType'],
    sourceType: row.source_type as ExpertIdentitySnapshot['sourceType'],
    verifiedAt: row.verified_at ?? null,
  }
  const { data, error } = await params.admin
    .from('diligence_expert_requests')
    .update({
      expert_id: row.id,
      expert_name: row.name,
      expert_email: row.email,
      expert_snapshot: snapshot as unknown as Json,
      expert_verification_type: row.verification_type,
      expert_source_type: row.source_type,
      expert_verified_at: row.verified_at,
      selection_method: params.selectionMethod,
    })
    .eq('id', params.requestId)
    .eq('deal_id', params.dealId)
    .eq('fund_id', params.fundId)
    .eq('status', 'draft')
    .select('*')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Draft expert request not found')
  return toExpertRequest(data)
}

export async function resolveResearchSource(params: {
  admin: Admin
  fundId: string
  dealId: string
  locatorValue: unknown
}): Promise<ExpertSourceRef> {
  const locator = parseSourceLocator(params.locatorValue)
  const { data: draft, error } = await params.admin
    .from('diligence_memo_drafts')
    .select('id, research_output')
    .eq('id', locator.draftId)
    .eq('deal_id', params.dealId)
    .eq('fund_id', params.fundId)
    .maybeSingle()
  if (error) throw error
  const researchDraft = draft as ResearchRow | null
  if (!researchDraft?.research_output || Array.isArray(researchDraft.research_output) || typeof researchDraft.research_output !== 'object') {
    throw new Error('Research source not found')
  }
  const output = researchDraft.research_output as Record<string, Json | undefined>
  const collection = locator.kind === 'research_gap' ? output.research_gaps : output.contradictions
  if (!Array.isArray(collection) || !collection[locator.index] || typeof collection[locator.index] !== 'object') {
    throw new Error('Research source not found')
  }
  if (locator.researchJobId) {
    const { data: job } = await params.admin
      .from('memo_agent_jobs')
      .select('id')
      .eq('id', locator.researchJobId)
      .eq('draft_id', locator.draftId)
      .eq('deal_id', params.dealId)
      .eq('fund_id', params.fundId)
      .eq('kind', 'research')
      .maybeSingle()
    if (!job) throw new Error('Research source not found')
  }
  return buildSourceRef(locator, collection[locator.index])
}
