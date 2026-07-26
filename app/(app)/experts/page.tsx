import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ExpertDirectory } from '@/components/experts/expert-directory'
import { resolvePageAccess, canViewPage } from '@/lib/access/page-gate'
import { listCandidates } from '@/lib/expert-discovery/service'
import { listExperts } from '@/lib/expert-validation/service'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ExpertDirectory')
  return { title: t('title') }
}

export default async function ExpertsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  const page = await resolvePageAccess(user.id)
  if (!page || !canViewPage(page, 'diligence')) redirect('/dashboard')
  const admin = createAdminClient()
  const [experts, candidates] = await Promise.all([
    listExperts(admin, page.fundId, '', { includeInactiveFund: page.isAdmin }),
    page.isAdmin ? listCandidates(admin, page.fundId) : Promise.resolve([]),
  ])
  return <ExpertDirectory initialExperts={experts} initialCandidates={candidates} isAdmin={page.isAdmin} />
}
