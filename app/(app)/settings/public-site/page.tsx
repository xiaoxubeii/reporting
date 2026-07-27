import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PublicSiteEditor } from './public-site-editor'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings.publicSite')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function PublicSiteSettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership?.role !== 'admin') redirect('/settings')
  return <PublicSiteEditor />
}
