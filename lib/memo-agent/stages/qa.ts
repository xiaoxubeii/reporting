import yaml from 'js-yaml'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAIUsage } from '@/lib/ai/usage'
import { getStageProvider } from '@/lib/memo-agent/stage-provider'
import { getActiveSchema, ensureDefaults } from '@/lib/memo-agent/firm-schemas'
import { buildSystemPrompt } from '@/lib/memo-agent/prompts/system'
import { buildQAUserContent, type QAQuestion, type PriorAnswer } from '@/lib/memo-agent/prompts/qa'
import type { IngestionOutput } from './ingest'
import type { ResearchOutput } from './research'
import { loadDiligenceOutputLanguage } from '@/lib/diligence/output-language-store'
import type { Json } from '@/lib/types/database'

type Admin = ReturnType<typeof createAdminClient>

export class QAConcurrentSessionError extends Error {}
export class QAResponseLimitError extends Error {}

export interface QABatchItem {
  question_id: string
  prompt: string
  rationale: string
  category: string
  intent: string
  sensitivity: 'standard' | 'high'
}

export interface QACoveredItem {
  question_id: string
  covered_by: 'ingestion' | 'research' | 'prior_answer'
  evidence: string
}

export interface QASessionState {
  session_id: string
  draft_id: string
  asked_ids: string[]
  /** Map of question_id → answer (latest only). */
  answers: Record<string, { answer_text: string; partner_id: string | null; answered_at: string }>
  /** Open question IDs in current batch (sent but not yet answered). */
  pending_question_ids: string[]
  total_questions: number
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

interface SessionMessage {
  role: 'system' | 'agent_batch' | 'partner_answer' | 'agent_covered'
  ts: string
  data: any
}

interface SessionRow {
  id: string
  fund_id: string
  deal_id: string
  draft_id: string
  stage: string | null
  messages: SessionMessage[]
}

async function loadSession(
  admin: Admin,
  sessionId: string,
  fundId: string,
  dealId: string,
  draftId: string,
): Promise<SessionRow | null> {
  const { data } = await admin
    .from('diligence_agent_sessions')
    .select('id, fund_id, deal_id, draft_id, stage, messages')
    .eq('id', sessionId)
    .eq('fund_id', fundId)
    .eq('deal_id', dealId)
    .eq('draft_id', draftId)
    .eq('stage', 'qa')
    .maybeSingle()
  if (!data) return null
  const row = data as any
  return {
    ...row,
    messages: Array.isArray(row.messages) ? row.messages : [],
  }
}

async function appendMessages(
  admin: Admin,
  sessionId: string,
  fundId: string,
  dealId: string,
  draftId: string,
  expectedMessageCount: number,
  messages: SessionMessage[],
) {
  if (messages.length === 0) return
  const { data, error } = await admin.rpc('append_diligence_qa_session_messages', {
    p_fund_id: fundId,
    p_deal_id: dealId,
    p_session_id: sessionId,
    p_draft_id: draftId,
    p_expected_message_count: expectedMessageCount,
    p_messages: messages as unknown as Json,
  })
  if (error) throw new Error(`Failed to append QA session messages: ${error.message}`)
  if (data === 'not-found') throw new Error('QA session is no longer active')
  if (data === 'stale-draft') throw new QAConcurrentSessionError('A newer project draft is active; refresh before continuing Q&A')
  if (data === 'conflict') throw new QAConcurrentSessionError('QA session changed; request the next batch again')
  if (data === 'limit') throw new Error('QA session message limit exceeded')
  if (data !== 'appended') throw new Error('Could not append QA session messages')
}

function extractAskedIds(messages: SessionMessage[]): Set<string> {
  const ids = new Set<string>()
  for (const m of messages) {
    if (m.role === 'agent_batch' && Array.isArray(m.data?.batch)) {
      for (const item of m.data.batch) if (typeof item.question_id === 'string') ids.add(item.question_id)
    }
    if (m.role === 'agent_covered' && Array.isArray(m.data?.covered)) {
      // Don't re-ask a covered question.
      for (const item of m.data.covered) if (typeof item.question_id === 'string') ids.add(item.question_id)
    }
  }
  return ids
}

function extractAnswers(messages: SessionMessage[]): Record<string, { answer_text: string; partner_id: string | null; answered_at: string }> {
  const out: Record<string, any> = {}
  for (const m of messages) {
    if (m.role === 'partner_answer' && Array.isArray(m.data?.answers)) {
      for (const a of m.data.answers) {
        if (typeof a.question_id === 'string' && typeof a.answer_text === 'string') {
          out[a.question_id] = {
            answer_text: a.answer_text,
            partner_id: a.partner_id ?? null,
            answered_at: m.ts,
          }
        }
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Public API: state introspection
// ---------------------------------------------------------------------------

export async function loadSessionState(
  admin: Admin,
  sessionId: string,
  fundId: string,
  dealId: string,
  draftId: string,
): Promise<QASessionState | null> {
  const session = await loadSession(admin, sessionId, fundId, dealId, draftId)
  if (!session) return null
  const askedIds = extractAskedIds(session.messages)
  const answers = extractAnswers(session.messages)
  const lastBatch = [...session.messages].reverse().find(m => m.role === 'agent_batch')
  const pending: string[] = lastBatch?.data?.batch?.map((b: any) => b.question_id) ?? []
  const stillPending = pending.filter(id => !answers[id])
  // total questions known from active library
  const lib = await loadQuestionLibrary(admin, fundId)
  return {
    session_id: sessionId,
    draft_id: draftId,
    asked_ids: Array.from(askedIds),
    answers,
    pending_question_ids: stillPending,
    total_questions: lib.questions.length,
  }
}

// ---------------------------------------------------------------------------
// Q&A Library
// ---------------------------------------------------------------------------

interface ParsedQALibrary {
  questions: QAQuestion[]
  questions_by_category: Map<string, QAQuestion[]>
  category_order: string[]
  batch_min: number
  batch_max: number
}

async function loadQuestionLibrary(admin: Admin, fundId: string): Promise<ParsedQALibrary> {
  // Seed-on-demand: if a fund has never visited the Schemas editor, the
  // default rows haven't been written yet. Insert them transparently before
  // reading so the first Q&A run on a new fund just works.
  await ensureDefaults(fundId, admin)
  const schema = await getActiveSchema(fundId, 'qa_library', admin)
  if (!schema?.yaml_content) {
    throw new Error('qa_library schema missing for fund. Visit Settings → Memo Agent → Schemas to seed defaults.')
  }
  const parsed = (schema.parsed_content as any) ?? yaml.load(schema.yaml_content) as any
  const questions = (parsed?.questions ?? []) as QAQuestion[]
  const cats = (parsed?.categories ?? []) as Array<{ id: string; order: number }>
  const sortedCats = cats.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(c => c.id)
  const byCat = new Map<string, QAQuestion[]>()
  for (const c of sortedCats) byCat.set(c, [])
  for (const q of questions) {
    if (!byCat.has(q.category)) byCat.set(q.category, [])
    byCat.get(q.category)!.push(q)
  }
  const batching = parsed?.batching_rules?.questions_per_batch ?? {}
  return {
    questions,
    questions_by_category: byCat,
    category_order: sortedCats.length ? sortedCats : Array.from(byCat.keys()),
    batch_min: typeof batching.min === 'number' ? batching.min : 4,
    batch_max: typeof batching.max === 'number' ? batching.max : 6,
  }
}

// ---------------------------------------------------------------------------
// Public API: get next batch
// ---------------------------------------------------------------------------

export async function getNextBatch(params: {
  admin: Admin
  fundId: string
  dealId: string
  draftId: string
  sessionId: string
}): Promise<{ batch: QABatchItem[]; covered: QACoveredItem[]; total_remaining: number }> {
  const { admin, fundId, dealId, draftId, sessionId } = params

  const lib = await loadQuestionLibrary(admin, fundId)

  // Existing session state.
  const session = await loadSession(admin, sessionId, fundId, dealId, draftId)
  if (!session) throw new Error('Session not found')
  const askedIds = extractAskedIds(session.messages)
  const answers = extractAnswers(session.messages)

  // Build candidate pool: not asked, not answered, in category order.
  const candidatesOrdered: QAQuestion[] = []
  for (const cat of lib.category_order) {
    for (const q of lib.questions_by_category.get(cat) ?? []) {
      if (askedIds.has(q.id)) continue
      if (answers[q.id]) continue
      candidatesOrdered.push(q)
    }
  }

  if (candidatesOrdered.length === 0) {
    return { batch: [], covered: [], total_remaining: 0 }
  }

  // Limit candidates the AI sees to a reasonable window so the prompt stays
  // small. The agent can only pick from this pool.
  const candidatePool = candidatesOrdered.slice(0, Math.max(lib.batch_max * 4, 20))

  // Load draft outputs for skip logic.
  const { data: draftRow } = await admin
    .from('diligence_memo_drafts')
    .select('ingestion_output, research_output')
    .eq('id', draftId)
    .eq('deal_id', dealId)
    .eq('fund_id', fundId)
    .eq('is_draft', true)
    .maybeSingle()
  if (!draftRow) throw new Error('Draft not found or already finalized')
  const ingestion = (draftRow as any)?.ingestion_output as IngestionOutput | null ?? null
  const research = (draftRow as any)?.research_output as ResearchOutput | null ?? null

  const priorAnswers: PriorAnswer[] = Object.entries(answers).map(([qid, a]) => ({
    question_id: qid,
    answer_text: a.answer_text,
    partner_id: a.partner_id,
    answered_at: a.answered_at,
  }))

  const { data: dealRow } = await admin
    .from('diligence_deals')
    .select('name')
    .eq('id', dealId)
    .eq('fund_id', fundId)
    .maybeSingle()
  const dealName = (dealRow as { name: string } | null)?.name ?? 'this deal'

  const outputLanguage = await loadDiligenceOutputLanguage({ admin, fundId, dealId, draftId })
  const { prompt: system } = await buildSystemPrompt({ admin, fundId, stage: 'qa', outputLanguage })
  const userContent = buildQAUserContent({
    dealName,
    ingestion,
    research,
    candidates: candidatePool,
    prior_answers: priorAnswers,
    batch_min: lib.batch_min,
    batch_max: lib.batch_max,
  })

  const { provider, model, providerType } = await getStageProvider(admin, fundId, 'qa')
  const { text, usage } = await provider.createMessage({
    model,
    maxTokens: 2048,
    system,
    content: userContent,
  })
  logAIUsage(admin, { fundId, dealId, provider: providerType, model, feature: 'memo_agent_qa_batch', usage })

  const parsed = parseQAResponse(text, candidatePool)

  // Persist this exchange.
  const newMessages: SessionMessage[] = []
  if (parsed.batch.length > 0) newMessages.push({ role: 'agent_batch', ts: new Date().toISOString(), data: { batch: parsed.batch } })
  if (parsed.covered.length > 0) newMessages.push({ role: 'agent_covered', ts: new Date().toISOString(), data: { covered: parsed.covered } })
  await appendMessages(admin, sessionId, fundId, dealId, draftId, session.messages.length, newMessages)

  const remainingAfter = candidatesOrdered.length - parsed.batch.length - parsed.covered.length
  return { ...parsed, total_remaining: Math.max(0, remainingAfter) }
}

function parseQAResponse(raw: string, candidates: QAQuestion[]): { batch: QABatchItem[]; covered: QACoveredItem[] } {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return { batch: [], covered: [] }
  }
  const candidateMap = new Map(candidates.map(q => [q.id, q]))

  const batch: QABatchItem[] = []
  for (const item of (parsed?.batch ?? [])) {
    const q = candidateMap.get(item?.question_id)
    if (!q) continue
    batch.push({
      question_id: q.id,
      prompt: typeof item.prompt === 'string' ? item.prompt : q.prompt,
      rationale: typeof item.rationale === 'string' ? item.rationale : '',
      category: q.category,
      intent: q.intent,
      sensitivity: q.sensitivity,
    })
  }

  const covered: QACoveredItem[] = []
  for (const item of (parsed?.covered ?? [])) {
    const id = typeof item?.question_id === 'string' ? item.question_id : null
    if (!id || !candidateMap.has(id)) continue
    if (batch.some(b => b.question_id === id)) continue
    covered.push({
      question_id: id,
      covered_by: ['ingestion', 'research', 'prior_answer'].includes(item?.covered_by) ? item.covered_by : 'ingestion',
      evidence: typeof item?.evidence === 'string' ? item.evidence : '',
    })
  }

  return { batch, covered }
}

// ---------------------------------------------------------------------------
// Public API: record partner answers
// ---------------------------------------------------------------------------

export async function recordResponses(params: {
  admin: Admin
  fundId: string
  dealId: string
  draftId: string
  sessionId: string
  partnerId: string
  answers: Array<{ question_id: string; answer_text: string }>
}): Promise<{ recorded: number }> {
  const { admin, fundId, dealId, draftId, sessionId, partnerId, answers } = params
  const { data, error } = await admin.rpc('append_diligence_partner_answers', {
    p_fund_id: fundId,
    p_deal_id: dealId,
    p_draft_id: draftId,
    p_session_id: sessionId,
    p_partner_id: partnerId,
    p_answers: answers,
  })
  if (error) throw new Error(`Failed to record QA responses: ${error.message}`)
  if (data === 'not-found') throw new Error('Session not found')
  if (data === 'stale-draft') throw new QAConcurrentSessionError('A newer project draft is active; refresh before continuing Q&A')
  if (data === 'limit') throw new QAResponseLimitError('QA response limit exceeded')
  if (data !== 'recorded') throw new Error('Could not record QA responses')
  return { recorded: answers.length }
}

// ---------------------------------------------------------------------------
// Public API: finish — write consolidated answers to the draft
// ---------------------------------------------------------------------------

export async function finishQA(params: {
  admin: Admin
  fundId: string
  dealId: string
  sessionId: string
  draftId: string
}): Promise<{ qa_count: number }> {
  const { admin, fundId, dealId, sessionId, draftId } = params
  const lib = await loadQuestionLibrary(admin, fundId)
  const questionMetadata = Object.fromEntries(lib.questions.map(question => [
    question.id,
    {
      feeds_dimensions: question.feeds_dimensions ?? [],
      category: question.category ?? null,
    },
  ]))
  const { data, error } = await admin.rpc('finish_diligence_qa_session', {
    p_fund_id: fundId,
    p_deal_id: dealId,
    p_session_id: sessionId,
    p_draft_id: draftId,
    p_question_metadata: questionMetadata,
  })
  if (error) throw new Error(`Failed to finish QA session: ${error.message}`)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Could not finish QA session')
  }
  const result = data as { status?: unknown; answers?: unknown }
  if (result.status === 'not-found') throw new Error('Session not found for this project')
  if (result.status === 'stale-draft') throw new QAConcurrentSessionError('A newer project draft is active; refresh before finishing Q&A')
  if (result.status !== 'completed' || !Array.isArray(result.answers)) {
    throw new Error('Could not finish QA session')
  }
  return { qa_count: result.answers.length }
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export async function startQASession(params: {
  admin: Admin
  fundId: string
  dealId: string
  draftId: string
  userId: string
}): Promise<string> {
  const { admin, fundId, dealId, draftId, userId } = params
  const { data, error } = await admin.rpc('start_diligence_qa_session', {
    p_fund_id: fundId,
    p_deal_id: dealId,
    p_draft_id: draftId,
    p_user_id: userId,
  })
  if (!error && data === null) {
    throw new QAConcurrentSessionError('A newer project draft is active; refresh before starting Q&A')
  }
  if (error || typeof data !== 'string') {
    throw new Error(`Failed to start Q&A session: ${error?.message ?? 'invalid project draft'}`)
  }
  return data
}
