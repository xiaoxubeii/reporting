import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { SearchPage } from '@/components/search/search-page'
import { canViewPage, resolvePageAccess } from '@/lib/access/page-gate'
import { loadSearchCategoryConfig, searchCategoryOptions } from '@/lib/search/categories'
import { createSearchRuntime } from '@/lib/search/runtime'
import { loadSearchSourcePolicy } from '@/lib/search/source-policy'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SearchProduct')
  return { title: t('title') }
}

export default async function SearchRoutePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  const page = await resolvePageAccess(user.id)
  if (!page || !canViewPage(page, 'dealflow', 'search')) redirect('/dashboard')

  const admin = createAdminClient()
  const [policy, categories, locale, t] = await Promise.all([
    loadSearchSourcePolicy(admin, page.fundId),
    loadSearchCategoryConfig(admin, page.fundId),
    getLocale(),
    getTranslations('SearchProduct'),
  ])
  if (!categories) return <SearchPage categories={Object.freeze([])} configurationUnavailable />

  const runtime = await createSearchRuntime({ admin, access: page.access, userId: user.id, policy })
  const options = searchCategoryOptions(categories, locale, runtime.runnableAdapterIds, t('sourceReasons.categoryUnavailable'))

  return <SearchPage categories={options} />
}
