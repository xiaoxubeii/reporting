import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

/**
 * Supabase Admin performs authoritative reads and mutating RPCs. Explicitly
 * opt every request out of Next's server data cache so an RPC result can
 * never be replayed after the underlying transaction has changed.
 */
export function adminNoStoreFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, cache: 'no-store' })
}

// Service-role client — bypasses RLS. Use only in API routes and server actions,
// never in client components. Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: adminNoStoreFetch,
      },
    }
  )
}
