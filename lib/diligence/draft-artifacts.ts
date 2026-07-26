import { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export async function draftHasGeneratedArtifacts(params: {
  admin: Admin
  fundId: string
  dealId: string
  draftId: string
  isDraft: boolean
  finalizedAt: string | null
}): Promise<boolean> {
  if (!params.isDraft || params.finalizedAt) return true

  const base = () => params.admin
    .from('diligence_memo_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('id', params.draftId)
    .eq('deal_id', params.dealId)
    .eq('fund_id', params.fundId)

  const checks = await Promise.all([
    base().not('ingestion_output', 'is', null),
    base().not('research_output', 'is', null),
    base().not('checklist_assessment_output', 'is', null),
    base().neq('qa_answers', []),
    base().not('memo_draft_output', 'is', null),
  ])

  // A failed summary check must never cause the UI to offer an in-place update.
  // The atomic language service remains authoritative on the write path.
  return checks.some(({ count, error }) => !!error || (count ?? 0) > 0)
}
