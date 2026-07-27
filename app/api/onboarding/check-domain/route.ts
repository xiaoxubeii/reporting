import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    {
      error: 'Email-domain Fund discovery has been retired. Ask a Fund administrator for an invitation.',
      code: 'domain_join_retired',
    },
    { status: 410 },
  )
}
