import { NextRequest, NextResponse } from 'next/server'

import { assertRouteAccess } from '@/lib/access/gate'
import { hasAccess } from '@/lib/access/effective'
import {
  DealResearchQueueError,
  queueDealResearch,
} from '@/lib/deals/research-queue'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const ROUTE = 'api/deals/[id]/research'

/** Queue manual Research with the authenticated user as its durable actor. */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const gate = await assertRouteAccess(admin, user.id, ROUTE, 'POST')
  if (gate instanceof NextResponse) return gate
  if (!hasAccess(gate.access, 'dealflow', 'read', 'search')) {
    return NextResponse.json({ error: 'Search is not available for this account.' }, { status: 403 })
  }

  try {
    const result = await queueDealResearch({
      dealId: params.id,
      fundId: gate.fundId,
      actor: { type: 'user', userId: gate.userId },
    })
    return NextResponse.json({
      queued: true,
      already: result.already,
      job_id: result.jobId,
      research_status: 'pending',
    })
  } catch (error) {
    if (error instanceof DealResearchQueueError) {
      if (error.code === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (error.code === 'disabled') {
        return NextResponse.json(
          { error: 'External deal research is turned off for this fund. Enable it in Settings → Deals.' },
          { status: 400 },
        )
      }
    }
    console.error('[deals/research] enqueue failed')
    return NextResponse.json({ error: 'Could not queue external research' }, { status: 500 })
  }
}
