import { redirect } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { APP_VERSION, checkForUpdate, getInstallationId } from '@/lib/version'

export async function generateMetadata() {
  const t = await getTranslations('Updates.metadata')
  return { title: t('title') }
}

export default async function UpdatesPage() {
  const [t, format] = await Promise.all([
    getTranslations('Updates'),
    getFormatter(),
  ])
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // Check admin
  const { data: member } = await supabase
    .from('fund_members')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle() as { data: { role: string } | null }

  if (member?.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()
  const [update, installationId] = await Promise.all([
    checkForUpdate(),
    getInstallationId(admin),
  ])

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('description')}
        </p>
      </div>

      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('currentVersion')}</p>
            <p className="text-lg font-mono font-medium">v{APP_VERSION}</p>
          </div>
          {update && (
            <div>
              <p className="text-sm text-muted-foreground">{t('latestVersion')}</p>
              <p className={`text-lg font-mono font-medium ${update.hasUpdate ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                v{update.latestVersion}
              </p>
            </div>
          )}
        </div>

        {update?.hasUpdate ? (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {t('available')}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              {t('published', { date: format.dateTime(new Date(update.publishedAt), { dateStyle: 'medium' }) })}
            </p>
          </div>
        ) : update ? (
          <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              {t('upToDate')}
            </p>
          </div>
        ) : (
          <div className="rounded-md bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              {t('unavailable')}
            </p>
          </div>
        )}
      </div>

      {update?.hasUpdate && update.body && (
        <div className="rounded-lg border p-6 space-y-3">
          <h2 className="text-lg font-semibold">{t('releaseNotes.title')}</h2>
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
            {update.body}
          </div>
          <a
            href={update.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline mt-2"
          >
            {t('releaseNotes.viewOnGitHub')} &rarr;
          </a>
        </div>
      )}

      {update?.hasUpdate && <div className="rounded-lg border p-6 space-y-3">
        <h2 className="text-lg font-semibold">{t('instructions.title')}</h2>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>{t('instructions.pull')}</p>
          <pre className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto">
{`cd reporting
git pull origin main
npm install
`}
          </pre>
          <p>{t('instructions.redeploy')}</p>
          <pre className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto">
{`npx supabase db push`}
          </pre>
          {t.rich('instructions.migrations', {
            path: chunks => <span className="font-mono">{chunks}</span>,
            releases: chunks => (
              <a
                href="https://github.com/tdavidson/reporting/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                {chunks}
              </a>
            ),
          })}
        </div>
      </div>}

      {installationId && (
        <p className="text-xs text-muted-foreground/60 font-mono">
          {t('installationId', { installationId })}
        </p>
      )}
    </div>
  )
}
