import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveDiligenceOutputLanguage,
  type DiligenceOutputLanguage,
} from './output-language'

export async function loadDiligenceOutputLanguage(params: {
  admin: SupabaseClient
  fundId: string
  dealId: string
  draftId?: string
}): Promise<DiligenceOutputLanguage> {
  const { admin, fundId, dealId, draftId } = params

  if (draftId) {
    const { data: draft, error } = await admin
      .from('diligence_memo_drafts')
      .select('output_language')
      .eq('id', draftId)
      .eq('deal_id', dealId)
      .eq('fund_id', fundId)
      .maybeSingle()
    if (error) throw new Error(`Failed to load draft output language: ${error.message}`)
    if (!draft) throw new Error('Draft not found')
    return resolveDiligenceOutputLanguage((draft as { output_language?: unknown }).output_language)
  }

  const { data: latestDraft, error: draftError } = await admin
    .from('diligence_memo_drafts')
    .select('output_language')
    .eq('deal_id', dealId)
    .eq('fund_id', fundId)
    .eq('is_draft', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (draftError) throw new Error(`Failed to load draft output language: ${draftError.message}`)
  if (latestDraft) {
    return resolveDiligenceOutputLanguage((latestDraft as { output_language?: unknown }).output_language)
  }

  const { data: deal, error: dealError } = await admin
    .from('diligence_deals')
    .select('output_language')
    .eq('id', dealId)
    .eq('fund_id', fundId)
    .maybeSingle()
  if (dealError) throw new Error(`Failed to load deal output language: ${dealError.message}`)
  if (!deal) throw new Error('Deal not found')
  return resolveDiligenceOutputLanguage((deal as { output_language?: unknown }).output_language)
}
