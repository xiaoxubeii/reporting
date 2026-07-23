import { ogMetadata } from '@/lib/og-metadata'
import { Shield } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

const SECTIONS = [
  ['self-hosted', 'selfHosted'],
  ['managed-deployment', 'managedDeployment'],
  ['managed-hosting', 'managedHosting'],
  ['this-website', 'website'],
  ['ai-providers', 'aiProviders'],
  ['third-party', 'thirdParty'],
  ['data-security', 'dataSecurity'],
  ['data-retention', 'dataRetention'],
  ['your-rights', 'rights'],
  ['children', 'children'],
  ['changes', 'changes'],
] as const

const linkClassName = 'text-foreground underline underline-offset-4 hover:text-foreground/80'

export async function generateMetadata() {
  const t = await getTranslations('Privacy.metadata')
  return ogMetadata({ title: t('title'), description: t('description') })
}

export default async function PrivacyPage() {
  const t = await getTranslations('Privacy')
  const tocLinks = (
    <ul className="space-y-1 text-muted-foreground">
      {SECTIONS.map(([id, key]) => (
        <li key={id}><a href={`#${id}`} className="hover:text-foreground underline underline-offset-4">{t(`sections.${key}.toc`)}</a></li>
      ))}
    </ul>
  )
  const richComponents = {
    p: (chunks: React.ReactNode) => <p className="text-muted-foreground mb-2 last:mb-0">{chunks}</p>,
    ul: (chunks: React.ReactNode) => <ul className="list-disc pl-5 text-muted-foreground space-y-1 mb-2">{chunks}</ul>,
    li: (chunks: React.ReactNode) => <li>{chunks}</li>,
    strong: (chunks: React.ReactNode) => <strong className="text-foreground">{chunks}</strong>,
    vercel: (chunks: React.ReactNode) => <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className={linkClassName}>{chunks}</a>,
    resend: (chunks: React.ReactNode) => <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className={linkClassName}>{chunks}</a>,
    supabase: (chunks: React.ReactNode) => <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className={linkClassName}>{chunks}</a>,
    fathom: (chunks: React.ReactNode) => <a href="https://usefathom.com/legal/privacy" target="_blank" rel="noopener noreferrer" className={linkClassName}>{chunks}</a>,
    email: (chunks: React.ReactNode) => <a href="mailto:hello@hemrock.com" className={linkClassName}>{chunks}</a>,
  }

  return (
    <div className="p-4 pt-6 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
        <Shield className="h-6 w-6 text-muted-foreground" />
        {t('title')}
      </h1>

      <nav className="xl:hidden mt-6 text-sm" aria-label={t('toc')}>
        <h2 className="text-base font-medium mb-2">{t('toc')}</h2>
        {tocLinks}
      </nav>

      <div className="flex gap-16 mt-6 xl:mt-6">
        <div className="flex-1 min-w-0 max-w-3xl text-sm leading-relaxed space-y-8">
          <p className="text-muted-foreground">{t('introduction')}</p>
          {SECTIONS.map(([id, key]) => (
            <section id={id} key={id}>
              <h2 className="text-base font-medium mb-2">{t(`sections.${key}.title`)}</h2>
              {t.rich(`sections.${key}.content`, richComponents)}
            </section>
          ))}

          <div className="rounded-lg border bg-card p-5">
            <p className="text-muted-foreground mb-3">{t('contact.prompt')}</p>
            <p className="text-muted-foreground"><a href="mailto:hello@hemrock.com" className={linkClassName}>hello@hemrock.com</a></p>
            <p className="text-muted-foreground mt-3">Unstructured Ventures, LLC<br />Attn: Taylor Davidson<br />6360 Broad St., #5226<br />Pittsburgh, PA 15206</p>
          </div>
          <p className="text-xs text-muted-foreground">{t('lastUpdated')}</p>
        </div>

        <nav className="hidden xl:block w-44 shrink-0 text-sm" aria-label={t('toc')}>
          <div className="sticky top-8">
            <h2 className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-3">{t('toc')}</h2>
            {tocLinks}
          </div>
        </nav>
      </div>
    </div>
  )
}
