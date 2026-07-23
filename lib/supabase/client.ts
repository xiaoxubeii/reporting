import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'
import { getBrowserSupabaseUrl } from '@/lib/supabase/browser-url'
import { getSupabaseCookieOptions } from '@/lib/supabase/cookie-options'

export function createClient() {
  const cookieOptions = getSupabaseCookieOptions()
  return createBrowserClient<Database>(
    getBrowserSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions },
  )
}
