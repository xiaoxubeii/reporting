import { NextRequest, NextResponse } from 'next/server'
import { assertRouteAccess } from '@/lib/access/gate'
import {
  changeDiligenceOutputLanguage,
  DiligenceOutputLanguageChangeError,
} from '@/lib/diligence/change-output-language'
import { parseDiligenceOutputLanguage } from '@/lib/diligence/output-language'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const ROUTE = 'api/diligence/[id]/output-language'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const gate = await assertRouteAccess(admin, user.id, ROUTE, 'POST')
  if (gate instanceof NextResponse) return gate

  const body = await request.json().catch(() => ({}))
  const outputLanguage = parseDiligenceOutputLanguage(body.output_language)
  if (!outputLanguage) {
    return NextResponse.json({ error: 'output_language must be en or zh-CN' }, { status: 400 })
  }
  const confirmVersion = body.confirm_version === true
  const expectedDraftId = confirmVersion && typeof body.expected_draft_id === 'string'
    ? body.expected_draft_id
    : null
  if (confirmVersion && (!expectedDraftId || !UUID_RE.test(expectedDraftId))) {
    return NextResponse.json({ error: 'expected_draft_id must identify the version being confirmed' }, { status: 400 })
  }

  try {
    const result = await changeDiligenceOutputLanguage({
      admin,
      fundId: gate.fundId,
      dealId: params.id,
      userId: gate.userId,
      outputLanguage,
      confirmVersion,
      expectedDraftId,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof DiligenceOutputLanguageChangeError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        confirmation_required: error.code === 'confirmation_required',
        expected_draft_id: error.expectedDraftId,
      }, { status: error.status })
    }
    return NextResponse.json({ error: 'Could not change diligence language.' }, { status: 500 })
  }
}
