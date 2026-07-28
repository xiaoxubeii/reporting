import {
  requireBackgroundExecutionContext,
  revalidateBackgroundExecutionContext,
  type BackgroundExecutionContext,
} from '@/lib/background-jobs/context'
import { claimBackgroundJobWorkerAttempt } from '@/lib/background-jobs/store'
import type { BackgroundJobAudience, BackgroundJobKind, BackgroundJobScope } from '@/lib/background-jobs/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/types/database'
import { runResearch, type ResearchResult } from './stages/research'
import {
  updateAttemptBoundMemoResearchProgress,
  writeAttemptBoundMemoResearchResult,
} from './research-background'

export interface MemoResearchProjection {
  readonly id: string
  readonly backgroundJobId: string
  readonly fundId: string
  readonly dealId: string
  readonly draftId: string
  readonly kind: 'research'
  readonly status: 'pending' | 'running'
}

export interface MemoResearchExecutionResult {
  readonly researchOutput: Json
  readonly summary: Json
}

export interface MemoResearchWorkerDependencies {
  restoreContext(
    authorization: string | null,
    audience: BackgroundJobAudience,
    requiredScope: BackgroundJobScope,
    requiredKind: BackgroundJobKind,
  ): Promise<BackgroundExecutionContext>
  claimExecution(context: BackgroundExecutionContext): Promise<boolean>
  loadProjection(context: BackgroundExecutionContext): Promise<MemoResearchProjection | null>
  updateProgress(context: BackgroundExecutionContext, memoJobId: string, message: string): Promise<boolean>
  runResearch(
    context: BackgroundExecutionContext,
    projection: MemoResearchProjection,
    progress: (message: string) => Promise<void>,
    signal: AbortSignal,
  ): Promise<MemoResearchExecutionResult>
  revalidate(context: BackgroundExecutionContext): Promise<BackgroundExecutionContext>
  writeResult(context: BackgroundExecutionContext, memoJobId: string, result: MemoResearchExecutionResult): Promise<boolean>
}

export interface MemoResearchWorkerResult {
  readonly status: number
  readonly body: Readonly<{ status?: string; error?: string }>
}

export async function executeMemoResearchWorker(
  request: Request,
  dependencies: MemoResearchWorkerDependencies = createDependencies(),
): Promise<MemoResearchWorkerResult> {
  if (!await hasEmptyBody(request)) {
    return { status: 400, body: { error: 'Worker request body must be empty' } }
  }

  let context: BackgroundExecutionContext
  try {
    context = await dependencies.restoreContext(
      request.headers.get('authorization'),
      'reporting-memo-research-worker',
      'memo-research:execute',
      'memo_research',
    )
  } catch {
    return { status: 401, body: { error: 'Unauthorized' } }
  }
  if (
    context.kind !== 'memo_research'
    || context.scope !== 'memo-research:execute'
    || context.actor.type !== 'user'
  ) {
    return { status: 401, body: { error: 'Unauthorized' } }
  }

  const { memoJobId, dealId, draftId } = context.payload
  if (typeof memoJobId !== 'string' || typeof dealId !== 'string' || typeof draftId !== 'string') {
    return { status: 409, body: { error: 'Background resource no longer matches' } }
  }
  if (!await dependencies.claimExecution(context)) {
    return { status: 409, body: { error: 'Background attempt is already executing' } }
  }

  const projection = await dependencies.loadProjection(context)
  if (!projection || !sameProjection(projection, context, memoJobId, dealId, draftId)) {
    return { status: 409, body: { error: 'Background resource no longer matches' } }
  }

  const progress = async (message: string) => {
    if (!await dependencies.updateProgress(context, memoJobId, message)) {
      throw new Error('Background attempt is no longer active')
    }
  }

  try {
    if (!await dependencies.updateProgress(context, memoJobId, 'Starting external research')) {
      return { status: 409, body: { error: 'Background attempt is no longer active' } }
    }
  } catch {
    return { status: 409, body: { error: 'Background attempt is no longer active' } }
  }

  let result: MemoResearchExecutionResult
  try {
    result = await dependencies.runResearch(context, projection, progress, request.signal)
  } catch {
    return { status: 503, body: { error: 'Memo Research attempt failed' } }
  }
  try {
    await dependencies.revalidate(context)
  } catch {
    return { status: 409, body: { error: 'Background attempt is no longer active' } }
  }

  if (!await dependencies.writeResult(context, memoJobId, result)) {
    return { status: 409, body: { error: 'Background attempt is no longer active' } }
  }
  return { status: 200, body: { status: 'done' } }
}

function createDependencies(admin: ReturnType<typeof createAdminClient> = createAdminClient()): MemoResearchWorkerDependencies {
  return {
    restoreContext(authorization, audience, requiredScope, requiredKind) {
      return requireBackgroundExecutionContext({ authorization, audience, requiredScope, requiredKind })
    },
    claimExecution(context) {
      return claimBackgroundJobWorkerAttempt({ jobId: context.jobId, attemptId: context.attemptId }, admin)
    },
    async loadProjection(context) {
      const memoJobId = context.payload.memoJobId
      if (typeof memoJobId !== 'string') return null
      const { data, error } = await admin
        .from('memo_agent_jobs')
        .select('id, background_job_id, fund_id, deal_id, draft_id, kind, status')
        .eq('id', memoJobId)
        .eq('fund_id', context.fundId)
        .maybeSingle()
      if (error) throw error
      const row = data as unknown as Record<string, unknown> | null
      if (
        !row
        || typeof row.id !== 'string'
        || typeof row.background_job_id !== 'string'
        || typeof row.fund_id !== 'string'
        || typeof row.deal_id !== 'string'
        || typeof row.draft_id !== 'string'
        || row.kind !== 'research'
        || (row.status !== 'pending' && row.status !== 'running')
      ) return null
      return {
        id: row.id,
        backgroundJobId: row.background_job_id,
        fundId: row.fund_id,
        dealId: row.deal_id,
        draftId: row.draft_id,
        kind: 'research',
        status: row.status,
      }
    },
    updateProgress(context, memoJobId, message) {
      return updateAttemptBoundMemoResearchProgress(admin, context, memoJobId, message)
    },
    async runResearch(context, projection, progress, signal) {
      const result = await runResearch({
        admin,
        fundId: projection.fundId,
        dealId: projection.dealId,
        draftId: projection.draftId,
        progressCb: progress,
        executionContext: context,
        persist: false,
        signal,
      })
      return {
        researchOutput: result.research_output as unknown as Json,
        summary: summarizeResult(result) as Json,
      }
    },
    revalidate(context) {
      return revalidateBackgroundExecutionContext(context)
    },
    writeResult(context, memoJobId, result) {
      return writeAttemptBoundMemoResearchResult(
        admin,
        context,
        memoJobId,
        result.researchOutput,
        result.summary,
      )
    },
  }
}

function summarizeResult(result: ResearchResult): Readonly<Record<string, unknown>> {
  return Object.freeze({
    draft_id: result.draft_id,
    findings: result.research_output.findings.length,
    contradictions: result.research_output.contradictions.length,
    competitors_named_by_company: result.research_output.competitive_map.named_by_company.length,
    competitors_named_by_research: result.research_output.competitive_map.named_by_research.length,
    founder_dossiers: result.research_output.founder_dossiers.length,
    research_gaps: result.research_output.research_gaps.length,
    research_mode: result.research_output.research_mode,
    warnings: result.warnings,
  })
}

function sameProjection(
  projection: MemoResearchProjection,
  context: BackgroundExecutionContext,
  memoJobId: string,
  dealId: string,
  draftId: string,
): boolean {
  return projection.id === memoJobId
    && projection.backgroundJobId === context.jobId
    && projection.fundId === context.fundId
    && projection.dealId === dealId
    && projection.draftId === draftId
    && projection.kind === 'research'
    && (projection.status === 'pending' || projection.status === 'running')
}

async function hasEmptyBody(request: Request): Promise<boolean> {
  if (!request.body) return true
  const reader = request.body.getReader()
  try {
    const first = await reader.read()
    return first.done === true || first.value.byteLength === 0
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
