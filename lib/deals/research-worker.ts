import type { SupabaseClient } from '@supabase/supabase-js'

import {
  requireBackgroundExecutionContext,
  type BackgroundExecutionContext,
} from '@/lib/background-jobs/context'
import { claimBackgroundJobWorkerAttempt } from '@/lib/background-jobs/store'
import type {
  BackgroundJobAudience,
  BackgroundJobKind,
  BackgroundJobScope,
} from '@/lib/background-jobs/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { runDealResearch } from './research'
import type { DealResearchRunResult } from './research'
import { writeAttemptBoundDealResearch } from './research-persistence'

export interface DealResearchWorkerDeal {
  readonly id: string
  readonly fundId: string
  readonly companyName: string | null
  readonly companyUrl: string | null
  readonly companyDomain: string | null
  readonly founderName: string | null
  readonly founderEmail: string | null
  readonly industry: string | null
  readonly stage: string | null
  readonly companySummary: string | null
}

export interface DealResearchWorkerDependencies {
  restoreContext(
    authorization: string | null,
    audience: BackgroundJobAudience,
    requiredScope: BackgroundJobScope,
    requiredKind: BackgroundJobKind,
  ): Promise<BackgroundExecutionContext>
  claimExecution(context: BackgroundExecutionContext): Promise<boolean>
  projectRunning(context: BackgroundExecutionContext): Promise<boolean>
  loadDeal(dealId: string, fundId: string): Promise<DealResearchWorkerDeal | null>
  runResearch(
    context: BackgroundExecutionContext,
    deal: DealResearchWorkerDeal,
  ): Promise<DealResearchRunResult>
}

export interface DealResearchWorkerResult {
  readonly status: number
  readonly body: Readonly<{ status?: string; error?: string }>
}

export async function executeDealResearchWorker(
  request: Request,
  dependencies: DealResearchWorkerDependencies = createDealResearchWorkerDependencies(),
): Promise<DealResearchWorkerResult> {
  if (!await hasEmptyBody(request)) {
    return { status: 400, body: { error: 'Worker request body must be empty' } }
  }

  let context: BackgroundExecutionContext
  try {
    context = await dependencies.restoreContext(
      request.headers.get('authorization'),
      'reporting-deal-research-worker',
      'deal-research:execute',
      'deal_research',
    )
  } catch {
    return { status: 401, body: { error: 'Unauthorized' } }
  }
  if (context.scope !== 'deal-research:execute') {
    return { status: 401, body: { error: 'Unauthorized' } }
  }

  const dealId = context.payload.dealId
  if (typeof dealId !== 'string') {
    return { status: 409, body: { error: 'Background resource no longer matches' } }
  }

  if (!await dependencies.claimExecution(context)) {
    return { status: 409, body: { error: 'Background attempt is already executing' } }
  }

  if (!await dependencies.projectRunning(context)) {
    return { status: 409, body: { error: 'Background attempt is no longer active' } }
  }
  const deal = await dependencies.loadDeal(dealId, context.fundId)
  if (!deal || deal.id !== dealId || deal.fundId !== context.fundId) {
    return { status: 409, body: { error: 'Background resource no longer matches' } }
  }

  const result = await dependencies.runResearch(context, deal)
  if (result.status === 'done') return { status: 200, body: { status: 'done' } }
  if (result.status === 'skipped') return { status: 422, body: { status: 'skipped' } }
  if (result.retryable) return { status: 503, body: { status: 'failed' } }
  // runDealResearch has already persisted the truthful Deal-level failure.
  // Retrying the same permanent provider/configuration failure is wasteful;
  // 422 tells the dispatcher that transport completed without claiming success.
  return { status: 422, body: { status: 'failed' } }
}

function createDealResearchWorkerDependencies(
  admin: SupabaseClient = createAdminClient(),
): DealResearchWorkerDependencies {
  return {
    restoreContext(authorization, audience, requiredScope, requiredKind) {
      return requireBackgroundExecutionContext({ authorization, audience, requiredScope, requiredKind })
    },
    claimExecution(context) {
      return claimBackgroundJobWorkerAttempt({ jobId: context.jobId, attemptId: context.attemptId }, admin)
    },
    projectRunning(context) {
      return writeAttemptBoundDealResearch(admin, context, { status: 'running' })
    },
    async loadDeal(dealId, fundId) {
      const { data, error } = await admin
        .from('inbound_deals')
        .select('id, fund_id, company_name, company_url, company_domain, founder_name, founder_email, industry, stage, company_summary')
        .eq('id', dealId)
        .eq('fund_id', fundId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        id: data.id,
        fundId: data.fund_id,
        companyName: data.company_name,
        companyUrl: data.company_url,
        companyDomain: data.company_domain,
        founderName: data.founder_name,
        founderEmail: data.founder_email,
        industry: data.industry,
        stage: data.stage,
        companySummary: data.company_summary,
      }
    },
    runResearch(context, deal) {
      return runDealResearch(admin, {
        fundId: context.fundId,
        dealId: deal.id,
        companyName: deal.companyName,
        companyUrl: deal.companyUrl,
        companyDomain: deal.companyDomain,
        founderName: deal.founderName,
        founderEmail: deal.founderEmail,
        industry: deal.industry,
        stage: deal.stage,
        companySummary: deal.companySummary,
        executionContext: context,
      })
    },
  }
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
