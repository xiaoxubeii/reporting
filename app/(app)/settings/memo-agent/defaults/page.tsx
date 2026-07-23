import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DefaultsEditor } from './editor'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings.defaults')
  return { title: t('metadataTitle') }
}

export default async function DefaultsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id')
    .eq('user_id', user.id)
    .maybeSingle()
  // Diligence settings are open to any fund member, not admin-only.
  if (!membership) redirect('/dashboard')

  return <DefaultsEditor />
}
