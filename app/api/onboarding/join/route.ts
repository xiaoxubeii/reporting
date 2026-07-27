import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error: 'Email-domain join requests have been retired. Ask a Fund administrator for an invitation.',
      code: 'domain_join_retired',
    },
    { status: 410 },
  )
}
