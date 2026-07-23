import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canViewPage, resolvePageAccess } from '@/lib/access/page-gate'

export default async function FeedsLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  const page = await resolvePageAccess(user.id)
  if (!page || !canViewPage(page, 'dealflow', 'feeds')) redirect('/dashboard')
  return children
}
