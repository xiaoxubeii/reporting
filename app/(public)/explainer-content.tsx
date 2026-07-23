import Image from 'next/image'
import type { LucideIcon } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ogMetadata } from '@/lib/og-metadata'

export type ExplainerNamespace =
  | 'PublicExplainers.accounting'
  | 'PublicExplainers.asks'
  | 'PublicExplainers.company'
  | 'PublicExplainers.compliance'
  | 'PublicExplainers.dashboard'
  | 'PublicExplainers.deals'
  | 'PublicExplainers.diligence'
  | 'PublicExplainers.funds'
  | 'PublicExplainers.import'
  | 'PublicExplainers.inbound'
  | 'PublicExplainers.interactions'
  | 'PublicExplainers.investments'
  | 'PublicExplainers.letters'
  | 'PublicExplainers.lpPortal'
  | 'PublicExplainers.lps'
  | 'PublicExplainers.notes'
  | 'PublicExplainers.review'
  | 'PublicExplainers.settings'
  | 'PublicExplainers.support'

export interface ExplainerContentProps {
  title: string
  icon: LucideIcon
  screenshotSrc?: string
  screenshotLabel?: string
  contentClassName?: string
  children: React.ReactNode
}

interface LocalizedExplainerContentProps {
  namespace: ExplainerNamespace
  icon: LucideIcon
  screenshotSrc?: string
}

interface LocalizedDashboardExplainerContentProps {
  icon: LucideIcon
  screenshotSrc: string
  secondaryScreenshotSrc?: string
}

export async function generateExplainerMetadata(namespace: ExplainerNamespace) {
  const t = await getTranslations(namespace)

  return ogMetadata({
    title: t('metadata.title'),
    description: t('metadata.description'),
  })
}

function richTextComponents() {
  const linkClassName =
    'text-foreground underline underline-offset-4 hover:text-foreground/80'

  return {
    p: (chunks: React.ReactNode) => <p className="text-muted-foreground">{chunks}</p>,
    strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
    em: (chunks: React.ReactNode) => <em>{chunks}</em>,
    card: (chunks: React.ReactNode) => (
      <div className="rounded-lg border bg-card p-5">{chunks}</div>
    ),
    h2: (chunks: React.ReactNode) => <h2 className="text-base font-medium mb-2">{chunks}</h2>,
    repository: (chunks: React.ReactNode) => (
      <a
        href="https://github.com/tdavidson/reporting"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {chunks}
      </a>
    ),
    hemrock: (chunks: React.ReactNode) => (
      <a
        href="https://www.hemrock.com"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {chunks}
      </a>
    ),
    github: (chunks: React.ReactNode) => (
      <a
        href="https://github.com/tdavidson/reporting"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {chunks}
      </a>
    ),
  }
}

export async function LocalizedExplainerContent({
  namespace,
  icon,
  screenshotSrc,
}: LocalizedExplainerContentProps) {
  const t = await getTranslations(namespace)
  const components = richTextComponents()

  return (
    <ExplainerContent
      title={t('title')}
      icon={icon}
      screenshotSrc={screenshotSrc}
      screenshotLabel={screenshotSrc ? t('screenshotLabel') : undefined}
      contentClassName={
        namespace === 'PublicExplainers.support'
          ? 'space-y-8 text-sm leading-relaxed'
          : undefined
      }
    >
      {t.rich('body', components)}
    </ExplainerContent>
  )
}

export async function LocalizedDashboardExplainerContent({
  icon,
  screenshotSrc,
  secondaryScreenshotSrc,
}: LocalizedDashboardExplainerContentProps) {
  const t = await getTranslations('PublicExplainers.dashboard')
  const components = richTextComponents()

  return (
    <ExplainerContent
      title={t('title')}
      icon={icon}
      screenshotSrc={screenshotSrc}
      screenshotLabel={t('screenshotLabel')}
    >
      {t.rich('body', components)}

      {secondaryScreenshotSrc ? (
        <>
          <h2 className="text-xl font-semibold tracking-tight mt-12 mb-6">
            {t('secondaryTitle')}
          </h2>
          <Image
            src={secondaryScreenshotSrc}
            alt={t('secondaryScreenshotLabel')}
            width={1200}
            height={900}
            className="w-full h-auto rounded-lg border shadow-sm mb-8"
          />
          <div className="space-y-4">{t.rich('secondaryBody', components)}</div>
        </>
      ) : null}
    </ExplainerContent>
  )
}

export function ExplainerContent({
  title,
  icon: Icon,
  screenshotSrc,
  screenshotLabel,
  contentClassName = 'space-y-4 text-sm leading-relaxed',
  children,
}: ExplainerContentProps) {
  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6 flex items-center gap-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
        {title}
      </h1>

      {screenshotSrc && (
        <Image
          src={screenshotSrc}
          alt={screenshotLabel || title}
          width={1200}
          height={900}
          className="w-full h-auto rounded-lg border shadow-sm mb-8"
          priority
        />
      )}

      <div className={contentClassName}>{children}</div>
    </div>
  )
}
