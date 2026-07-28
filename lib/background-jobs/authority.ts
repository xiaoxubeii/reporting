import type { SupabaseClient } from '@supabase/supabase-js'

import type { BackgroundJobPayload } from './types'

export interface BackgroundJobResourceAuthority {
  readonly jobId: string
  readonly kind: string
  readonly payload: BackgroundJobPayload
  readonly fundId: string
}

export type BackgroundJobResourceValidator = (
  input: BackgroundJobResourceAuthority,
) => Promise<void>

/**
 * Domain authorization is a kind adapter, not part of token/context restoration.
 * New job kinds register their own branch here without changing the generic core.
 */
export function createSupabaseBackgroundJobResourceValidator(
  admin: SupabaseClient,
): BackgroundJobResourceValidator {
  return async input => {
    if (input.kind === 'deal_research') {
      await validateDealResearchAuthority(admin, input)
      return
    }
    if (input.kind === 'memo_research') {
      await validateMemoResearchAuthority(admin, input)
      return
    }
    if (input.kind === 'feed_discovery') {
      await validateFeedDiscoveryAuthority(admin, input)
      return
    }
    throw new Error('Unsupported background job authority adapter')
  }
}

async function validateMemoResearchAuthority(
  admin: SupabaseClient,
  input: BackgroundJobResourceAuthority,
): Promise<void> {
  const { memoJobId, dealId, draftId } = input.payload
  if (typeof memoJobId !== 'string' || typeof dealId !== 'string' || typeof draftId !== 'string') {
    throw new Error('Invalid Memo Research resource')
  }
  const [memoResult, draftResult] = await Promise.all([
    admin
      .from('memo_agent_jobs')
      .select('id, background_job_id, fund_id, deal_id, draft_id, kind, status')
      .eq('id', memoJobId)
      .eq('fund_id', input.fundId)
      .maybeSingle(),
    admin
      .from('diligence_memo_drafts')
      .select('id, fund_id, deal_id, is_draft, ingestion_output')
      .eq('id', draftId)
      .eq('fund_id', input.fundId)
      .eq('deal_id', dealId)
      .maybeSingle(),
  ])
  if (memoResult.error) throw memoResult.error
  if (draftResult.error) throw draftResult.error
  const memo = memoResult.data as unknown as Record<string, unknown> | null
  const draft = draftResult.data as unknown as Record<string, unknown> | null
  if (
    !memo
    || memo.id !== memoJobId
    || memo.background_job_id !== input.jobId
    || memo.fund_id !== input.fundId
    || memo.deal_id !== dealId
    || memo.draft_id !== draftId
    || memo.kind !== 'research'
    || (memo.status !== 'pending' && memo.status !== 'running')
    || !draft
    || draft.id !== draftId
    || draft.fund_id !== input.fundId
    || draft.deal_id !== dealId
    || draft.is_draft !== true
    || draft.ingestion_output == null
  ) {
    throw new Error('Background job resource mismatch')
  }
}

async function validateFeedDiscoveryAuthority(
  admin: SupabaseClient,
  input: BackgroundJobResourceAuthority,
): Promise<void> {
  const { data, error } = await admin
    .from('fund_settings')
    .select('fund_id')
    .eq('fund_id', input.fundId)
    .maybeSingle()
  if (error) throw error
  if (!data || data.fund_id !== input.fundId) throw new Error('Feed Discovery fund is unavailable')
}

async function validateDealResearchAuthority(
  admin: SupabaseClient,
  input: BackgroundJobResourceAuthority,
): Promise<void> {
  const dealId = input.payload.dealId
  if (typeof dealId !== 'string') throw new Error('Invalid Deal Research resource')
  const [dealResult, settingsResult] = await Promise.all([
    admin.from('inbound_deals').select('id, fund_id').eq('id', dealId).maybeSingle(),
    admin.from('fund_settings').select('deal_research_enabled' as never).eq('fund_id', input.fundId).maybeSingle(),
  ])
  if (dealResult.error) throw dealResult.error
  if (settingsResult.error) throw settingsResult.error
  if (!dealResult.data || dealResult.data.id !== dealId || dealResult.data.fund_id !== input.fundId) {
    throw new Error('Background job resource mismatch')
  }
  if (!(settingsResult.data as unknown as { deal_research_enabled?: boolean } | null)?.deal_research_enabled) {
    throw new Error('Deal Research is disabled')
  }
}
