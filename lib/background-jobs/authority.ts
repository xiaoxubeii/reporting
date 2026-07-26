import type { SupabaseClient } from '@supabase/supabase-js'

import type { BackgroundJobPayload } from './types'

export interface BackgroundJobResourceAuthority {
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
    if (input.kind === 'feed_discovery') {
      await validateFeedDiscoveryAuthority(admin, input)
      return
    }
    throw new Error('Unsupported background job authority adapter')
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
