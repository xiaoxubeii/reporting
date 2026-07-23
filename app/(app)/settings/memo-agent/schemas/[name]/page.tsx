import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureDefaults, getActiveSchema } from '@/lib/memo-agent/firm-schemas'
import { SCHEMA_NAMES, type SchemaName } from '@/lib/memo-agent/validate'
import { SchemaEditor } from './schema-editor'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings.schemaEditor')
  return { title: t('metadataTitle') }
}

export default async function SchemaEditorPage({ params }: { params: { name: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const name = params.name as SchemaName
  if (!SCHEMA_NAMES.includes(name)) notFound()

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/dashboard')
  // Diligence settings are open to any fund member, not admin-only.

  await ensureDefaults(membership.fund_id, admin)
  const schema = await getActiveSchema(membership.fund_id, name, admin)
  if (!schema) notFound()

  return <SchemaEditor schemaName={name} initialContent={schema.yaml_content} initialVersion={schema.schema_version} />
}
