import { NextResponse } from 'next/server'
import { assertAdminAccess } from '@/lib/api-helpers'
import { SEARCH_ADAPTER_DESCRIPTORS, SEARCH_ADAPTER_ID_SET } from '@/lib/search/adapter-contracts'
import { loadSearchCategoryConfig, parseSearchCategoryConfig } from '@/lib/search/categories'
import { SearchContractError } from '@/lib/search/contracts'
import {
  assertSameOriginSearchRequest,
  MAX_SEARCH_CATEGORY_CONFIG_BODY_BYTES,
  readSearchJson,
  SearchRequestBodyError,
} from '@/lib/search/route-input'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await adminGuard()
  if (guard instanceof NextResponse) return guard
  const config = await loadSearchCategoryConfig(guard.admin, guard.fundId)
  if (!config) return NextResponse.json({ error: 'Search categories are not available.' }, { status: 503 })
  return NextResponse.json({ config, adapters: SEARCH_ADAPTER_DESCRIPTORS }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: Request) {
  try {
    assertSameOriginSearchRequest(request)
    const guard = await adminGuard()
    if (guard instanceof NextResponse) return guard
    const config = parseSearchCategoryConfig(await readSearchJson(request, MAX_SEARCH_CATEGORY_CONFIG_BODY_BYTES), {
      knownAdapterIds: SEARCH_ADAPTER_ID_SET,
    })
    const { data, error } = await guard.admin
      .from('fund_settings')
      .update({ search_category_config: config as unknown as Json })
      .eq('fund_id', guard.fundId)
      .select('fund_id')
      .maybeSingle()
    if (error || !data) {
      console.error('[settings/search-categories] update failed', { fundId: guard.fundId, code: error?.code ?? 'missing_row' })
      return NextResponse.json({ error: 'Search categories could not be saved.' }, { status: 500 })
    }
    return NextResponse.json({ config }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof SearchRequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof SearchContractError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[settings/search-categories] unexpected failure')
    return NextResponse.json({ error: 'Search categories could not be saved.' }, { status: 500 })
  }
}

async function adminGuard(): Promise<
  | { readonly admin: ReturnType<typeof createAdminClient>; readonly fundId: string }
  | NextResponse
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const access = await assertAdminAccess(admin, user.id)
  if (access instanceof NextResponse) return access
  return Object.freeze({ admin, fundId: access.fundId })
}
