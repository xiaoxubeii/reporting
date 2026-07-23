import type { SupabaseClient } from '@supabase/supabase-js'

export async function approveFundJoinRequest(
  admin: SupabaseClient,
  params: { requestId: string; fundId: string; reviewedBy: string; claimId: string },
): Promise<void> {
  const { error } = await admin.rpc('approve_fund_join_request', {
    p_request_id: params.requestId,
    p_fund_id: params.fundId,
    p_reviewed_by: params.reviewedBy,
    p_claim_id: params.claimId,
  })
  if (error) throw new Error('Unable to approve fund join request')
}

export async function claimFundJoinRequestApproval(
  admin: SupabaseClient,
  params: { requestId: string; fundId: string; reviewedBy: string; claimId: string },
): Promise<boolean> {
  const { data, error } = await admin.rpc('claim_fund_join_request_approval', {
    p_request_id: params.requestId,
    p_fund_id: params.fundId,
    p_reviewed_by: params.reviewedBy,
    p_claim_id: params.claimId,
  })
  if (error) throw new Error('Unable to claim fund join request approval')
  return data === true
}

export async function releaseFundJoinRequestApproval(
  admin: SupabaseClient,
  params: { requestId: string; claimId: string },
): Promise<void> {
  const { error } = await admin.rpc('release_fund_join_request_approval', {
    p_request_id: params.requestId,
    p_claim_id: params.claimId,
  })
  if (error) throw new Error('Unable to release fund join request approval')
}

export async function rejectFundJoinRequest(
  admin: SupabaseClient,
  params: { requestId: string; fundId: string; reviewedBy: string },
): Promise<boolean> {
  const { data, error } = await admin.rpc('reject_fund_join_request', {
    p_request_id: params.requestId,
    p_fund_id: params.fundId,
    p_reviewed_by: params.reviewedBy,
  })
  if (error) throw new Error('Unable to reject fund join request')
  return data === true
}
