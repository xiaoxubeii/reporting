import { NextRequest, NextResponse } from 'next/server'
import { internalContext } from '@/lib/expert-validation/api'
import { readExpertEmailThread } from '@/lib/email/fund-thread-read'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; requestId: string } },
) {
  const context = await internalContext('read')
  if (context instanceof NextResponse) return noStore(context)

  try {
    const thread = await readExpertEmailThread(context.admin, {
      fundId: context.gate.fundId,
      dealId: params.id,
      requestId: params.requestId,
    })
    if (!thread) return json({ error: 'Not found' }, 404)
    return json({ thread })
  } catch {
    console.error('[expert-email-thread] authorized read failed', {
      dealId: params.id,
      requestId: params.requestId,
    })
    return json({ error: 'Internal error' }, 500)
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

function noStore(response: NextResponse) {
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      ...NO_STORE_HEADERS,
    },
  })
}
