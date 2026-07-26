import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getTrustedRequestTenant } from '@/lib/tenancy/request'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tenant = await getTrustedRequestTenant(createClient() as never, new Headers(headers()))
  return NextResponse.json({
    fundName: tenant?.name ?? null,
    fundLogo: tenant?.logoUrl ?? null,
    fundSlug: tenant?.slug ?? null,
    theme: tenant?.theme ?? null,
  })
}
