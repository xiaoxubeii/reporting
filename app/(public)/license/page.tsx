import { ogMetadata } from '@/lib/og-metadata'
import { Scale } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('License.metadata')
  return ogMetadata({ title: t('title'), description: t('description') })
}

export default async function LicensePage() {
  const t = await getTranslations('License')

  return (
    <div className="p-4 pt-6 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
        <Scale className="h-6 w-6 text-muted-foreground" />
        {t('title')}
      </h1>

      <div className="mt-6 max-w-3xl text-sm leading-relaxed space-y-8">
        {/* Summary */}
        <div>
          <h2 className="text-base font-medium mb-2">{t('summary.title')}</h2>
          <p className="text-muted-foreground mb-2">
            {t('summary.use')}
          </p>
          <p className="text-muted-foreground mb-2">
            {t.rich('summary.redistribution', {
              notice: chunks => <code className="text-foreground">{chunks}</code>,
            })}
          </p>
          <p className="text-muted-foreground mb-2">
            {t.rich('summary.branding', {
              repository: chunks => (
                <a
                  href="https://github.com/tdavidson/reporting"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
          <p className="text-muted-foreground">
            {t.rich('summary.warranty', {
              email: chunks => (
                <a
                  href="mailto:hello@hemrock.com"
                  className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>

        {/* Full license text */}
        <div>
          <h2 className="text-base font-medium mb-2">{t('full.title')}</h2>
          <p className="text-muted-foreground">
            {t.rich('full.body', {
              license: chunks => (
                <a
                  href="https://github.com/tdavidson/reporting/blob/main/LICENSE.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                >
                  {chunks}
                </a>
              ),
              apache: chunks => (
                <a
                  href="https://www.apache.org/licenses/LICENSE-2.0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          {t('copyright')}
        </p>
      </div>
    </div>
  )
}
