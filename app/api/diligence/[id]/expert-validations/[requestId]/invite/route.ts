import { NextRequest, NextResponse } from 'next/server'
import { apiError, assertDeal, internalContext, readJson } from '@/lib/expert-validation/api'
import { issueInvitation } from '@/lib/expert-validation/invitation'

export async function POST(req: NextRequest, { params }: { params: { id: string; requestId: string } }) {
  const context = await internalContext('write')
  if (context instanceof NextResponse) return context
  try {
    if (!await assertDeal(context.admin, context.gate.fundId, params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const body = await readJson(req, 1_000) as Record<string, unknown>
    const result = await issueInvitation({
      admin: context.admin as never,
      fundId: context.gate.fundId,
      actorUserId: context.gate.userId,
      dealId: params.id,
      requestId: params.requestId,
      reissue: body.reissue === true,
    })
    return NextResponse.json({
      request: result.request,
      invitation_url: result.invitationUrl,
      email_accepted: result.emailAccepted,
      warning: result.warning,
    }, { status: result.emailAccepted ? 200 : 202 })
  } catch (error) {
    return apiError(error)
  }
}
