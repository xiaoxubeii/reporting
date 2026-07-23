import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AnchorEditor, type Anchor } from './editor'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings.anchorEditor')
  return { title: t('metadataTitle') }
}

export default async function StyleAnchorEditorPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/dashboard')
  // Diligence settings are open to any fund member, not admin-only.

  const { data: anchor } = await admin
    .from('style_anchor_memos')
    .select('*')
    .eq('id', params.id)
    .eq('fund_id', membership.fund_id)
    .maybeSingle()
  if (!anchor) notFound()

  return <AnchorEditor anchor={anchor as Anchor} />
}
