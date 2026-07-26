import { createAdminClient } from '@/lib/supabase/admin'
import type { Json, Tables } from '@/lib/types/database'
import { createExpertEmbedding, EXPERT_EMBEDDING_MODEL, vectorLiteral } from '@/lib/expert-validation/embedding'
import { discoverFromSource } from './adapters'
import type {
  DiscoverySourceOutcome,
  DiscoveredExpert,
  ExpertCandidate,
  ExpertDiscoverySourceId,
  ExpertSourceEvidence,
} from './types'

type Admin = ReturnType<typeof createAdminClient>
type CandidateRow = Tables<'expert_candidates'>

export async function discoverExperts(params: {
  admin: Admin
  fundId: string
  userId: string
  query: string
  sourceIds: readonly ExpertDiscoverySourceId[]
  signal: AbortSignal
}): Promise<{ candidates: ExpertCandidate[]; sources: DiscoverySourceOutcome[] }> {
  const outcomes = await Promise.all(params.sourceIds.map(async sourceId => {
    try {
      const people = await discoverFromSource(sourceId, params.query, params.signal)
      return { sourceId, people, status: 'ok' as const }
    } catch (error) {
      console.warn('[expert-discovery] source failed', { sourceId, error: error instanceof Error ? error.message : 'unknown' })
      return { sourceId, people: Object.freeze([]), status: 'error' as const }
    }
  }))
  const selected = selectDiscoveredPeople(outcomes, 25)
  const rows = selected.map(person => ({
    identityFingerprint: person.identityFingerprint,
    name: person.name,
    email: person.email,
    title: person.title,
    organization: person.organization,
    profileText: person.profileText,
    sourceEvidence: person.evidence as unknown as Json,
  }))
  if (rows.length > 0) {
    const { error } = await params.admin.rpc('merge_expert_candidates', {
      p_fund_id: params.fundId,
      p_user_id: params.userId,
      p_query: params.query,
      p_candidates: rows as unknown as Json,
    })
    if (error) throw new Error(error.message)
  }
  return {
    candidates: await listCandidates(params.admin, params.fundId),
    sources: outcomes.map(outcome => ({ sourceId: outcome.sourceId, status: outcome.status, resultCount: outcome.people.length })),
  }
}

export function selectDiscoveredPeople(
  outcomes: readonly { people: readonly DiscoveredExpert[] }[],
  limit: number,
): DiscoveredExpert[] {
  const interleaved: DiscoveredExpert[] = []
  const largestSource = outcomes.reduce((largest, outcome) => Math.max(largest, outcome.people.length), 0)

  for (let index = 0; index < largestSource; index += 1) {
    for (const outcome of outcomes) {
      const person = outcome.people[index]
      if (person) interleaved.push(person)
    }
  }

  return mergeDiscoveredPeople(interleaved).slice(0, Math.max(0, limit))
}

export async function listCandidates(admin: Admin, fundId: string, status?: string): Promise<ExpertCandidate[]> {
  let query = admin.from('expert_candidates').select('*').eq('fund_id', fundId).order('updated_at', { ascending: false }).limit(250)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(toCandidate)
}

export async function confirmCandidate(params: {
  admin: Admin
  fundId: string
  userId: string
  candidateId: string
  input: { email: string; name: string; title: string; organization: string; profileText: string }
}): Promise<{ expertId: string; embeddingWarning?: string }> {
  const { data: expertId, error } = await params.admin.rpc('confirm_expert_candidate', {
    p_candidate_id: params.candidateId,
    p_fund_id: params.fundId,
    p_user_id: params.userId,
    p_email: params.input.email,
    p_name: params.input.name,
    p_title: params.input.title,
    p_organization: params.input.organization,
    p_profile_text: params.input.profileText,
  })
  if (error) throw new Error(error.message)
  const { data: expert, error: expertError } = await params.admin.from('experts')
    .select('id, fund_id, scope, status, source_type, verification_type, profile_text, embedding')
    .eq('id', expertId).eq('fund_id', params.fundId).eq('scope', 'fund')
    .eq('source_type', 'discovery').eq('verification_type', 'fund_confirmed').maybeSingle()
  if (expertError) throw new Error(expertError.message)
  if (!expert) throw new Error('Confirmed expert is not eligible')
  let embeddingWarning: string | undefined
  if (expert.status === 'active' && !expert.embedding) {
    try {
      const embedding = vectorLiteral(await createExpertEmbedding(params.admin as never, params.fundId, expert.profile_text))
      const { data: updated, error: updateError } = await params.admin.from('experts')
        .update({ embedding, embedding_model: EXPERT_EMBEDDING_MODEL })
        .eq('id', expertId).eq('fund_id', params.fundId).eq('scope', 'fund')
        .eq('source_type', 'discovery').select('id').maybeSingle()
      if (updateError) throw new Error(updateError.message)
      if (!updated) throw new Error('Confirmed expert embedding target not found')
    } catch {
      embeddingWarning = 'Expert confirmed, but automatic matching is unavailable until an embedding can be generated.'
    }
  }
  return { expertId, embeddingWarning }
}

export async function rejectCandidate(params: { admin: Admin; fundId: string; userId: string; candidateId: string; reason: string | null }) {
  const { data, error } = await params.admin.from('expert_candidates').update({
    status: 'rejected', reviewed_by: params.userId, reviewed_at: new Date().toISOString(),
    rejection_reason: params.reason, email: null, discovery_query: '[redacted after rejection]',
  }).eq('id', params.candidateId).eq('fund_id', params.fundId).eq('status', 'pending').select('id').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Pending candidate not found')
}

function toCandidate(row: CandidateRow): ExpertCandidate {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    title: row.title ?? null,
    organization: row.organization ?? null,
    profileText: row.profile_text,
    status: row.status as ExpertCandidate['status'],
    discoveryQuery: row.discovery_query,
    evidence: Array.isArray(row.source_evidence) ? row.source_evidence as unknown as ExpertSourceEvidence[] : [],
    confirmedExpertId: row.confirmed_expert_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mergeDiscoveredPeople(people: readonly DiscoveredExpert[]): DiscoveredExpert[] {
  const merged = new Map<string, DiscoveredExpert>()
  for (const person of people) {
    const existing = merged.get(person.identityFingerprint)
    if (!existing) {
      merged.set(person.identityFingerprint, person)
      continue
    }
    const evidence = new Map(
      [...existing.evidence, ...person.evidence]
        .map(item => [`${item.sourceId}:${item.recordId}:${item.role ?? ''}`, item] as const),
    )
    merged.set(person.identityFingerprint, Object.freeze({
      ...existing,
      email: existing.email ?? person.email,
      title: existing.title ?? person.title,
      organization: existing.organization ?? person.organization,
      evidence: Object.freeze(Array.from(evidence.values()).slice(0, 20)),
    }))
  }
  return Array.from(merged.values())
}
