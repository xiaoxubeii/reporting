import type { Metadata } from 'next'
import { getFormatter, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureDefaults, getActiveSchemas } from '@/lib/memo-agent/firm-schemas'
import { SCHEMA_NAMES } from '@/lib/memo-agent/validate'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Settings.schemas')
  return { title: t('metadataTitle') }
}

export default async function SchemasIndexPage() {
  const [t, format] = await Promise.all([getTranslations('Settings.schemas'), getFormatter()])
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

  await ensureDefaults(membership.fund_id, admin)
  const schemas = await getActiveSchemas(membership.fund_id, admin)

  return (
    <div className="p-4 md:py-8 md:pl-8 md:pr-4 max-w-4xl">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> {t('back')}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        {t('description')}
      </p>

      <div className="rounded-md border bg-card divide-y">
        {SCHEMA_NAMES.map(name => {
          const row = schemas[name]
          return (
            <Link
              key={name}
              href={`/settings/memo-agent/schemas/${name}`}
              className="block p-4 hover:bg-muted/30"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{t(`items.${name}.label`)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t(`items.${name}.description`)}</div>
                </div>
                <div className="text-right text-xs text-muted-foreground shrink-0">
                  {row ? (
                    <>
                      <div className="font-mono">{row.schema_version}</div>
                      <div>{format.dateTime(new Date(row.edited_at), { dateStyle: 'medium' })}</div>
                    </>
                  ) : (
                    <span className="italic">{t('notSeededYet')}</span>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
