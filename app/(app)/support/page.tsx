import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownCircle,
  Briefcase,
  Building2,
  ClipboardCheck,
  Crown,
  DollarSign,
  FileText,
  Handshake,
  Lightbulb,
  Mail,
  MessageSquare,
  Microscope,
  Monitor,
  PanelLeftClose,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { AnalystToggleButton } from '@/components/analyst-button'
import { AnalystPanel } from '@/components/analyst-panel'

type SectionDefinition = {
  id: string
  key: string
  icon?: LucideIcon
  secondaryIcon?: LucideIcon
  nested?: boolean
}

const RAW_SECTIONS = [
  { id: 'getting-started', key: 'gettingStarted' },
  { id: 'setup', key: 'setup', nested: true },
  { id: 'license', key: 'license', nested: true },
  { id: 'pricing', key: 'pricing', nested: true },
  { id: 'portfolio', key: 'portfolio', icon: Building2 },
  { id: 'company-detail', key: 'companyDetail', icon: Building2, nested: true },
  { id: 'review', key: 'review', icon: ClipboardCheck },
  { id: 'inbound', key: 'inbound', icon: Mail },
  { id: 'email-detail', key: 'emailDetail', icon: Mail, nested: true },
  { id: 'import', key: 'import', icon: Upload },
  { id: 'asks', key: 'asks', icon: Send },
  { id: 'settings', key: 'settings', icon: Settings },
  { id: 'notes', key: 'notes', icon: MessageSquare },
  { id: 'interactions', key: 'interactions', icon: Handshake },
  { id: 'deals', key: 'deals', icon: Lightbulb },
  { id: 'diligence', key: 'diligence', icon: Microscope },
  { id: 'investments', key: 'investments', icon: DollarSign },
  { id: 'funds', key: 'funds', icon: Briefcase },
  { id: 'letters', key: 'letters', icon: FileText },
  { id: 'lps', key: 'lps', icon: Crown },
  { id: 'compliance', key: 'compliance', icon: ShieldCheck },
  { id: 'usage', key: 'usage', icon: Users },
  { id: 'analyst', key: 'analyst', icon: Sparkles },
  { id: 'file-handling', key: 'fileHandling', icon: Shield },
  { id: 'updates', key: 'updates', icon: ArrowDownCircle },
  { id: 'sidebar', key: 'sidebar', icon: Monitor, secondaryIcon: PanelLeftClose },
] as const satisfies readonly SectionDefinition[]

const SECTIONS = RAW_SECTIONS.map(section => ({
  nested: false,
  icon: undefined as LucideIcon | undefined,
  secondaryIcon: undefined as LucideIcon | undefined,
  ...section,
}))

const linkClassName = 'text-foreground underline underline-offset-4 hover:text-foreground/80'

export async function generateMetadata() {
  const t = await getTranslations('Support.metadata')
  return { title: t('title'), description: t('description') }
}

export default async function SupportPage() {
  const t = await getTranslations('Support')
  const tocLinks = (
    <ul className="space-y-1 text-muted-foreground">
      {SECTIONS.map(section => (
        <li key={section.id} className={section.nested ? 'pl-4' : undefined}>
          <a href={`#${section.id}`} className="hover:text-foreground underline underline-offset-4">
            {t(`sections.${section.key}.toc`)}
          </a>
        </li>
      ))}
    </ul>
  )
  const richComponents = {
    p: (chunks: React.ReactNode) => <p className="text-muted-foreground mb-2 last:mb-0">{chunks}</p>,
    strong: (chunks: React.ReactNode) => <strong className="text-foreground">{chunks}</strong>,
    github: (chunks: React.ReactNode) => <a href="https://github.com/tdavidson/reporting" target="_blank" rel="noopener noreferrer" className={linkClassName}>{chunks}</a>,
    hemrock: (chunks: React.ReactNode) => <a href="https://www.hemrock.com" target="_blank" rel="noopener noreferrer" className={linkClassName}>{chunks}</a>,
    email: (chunks: React.ReactNode) => <a href="mailto:hello@hemrock.com" className={linkClassName}>{chunks}</a>,
    license: (chunks: React.ReactNode) => <a href="/license" className={linkClassName}>{chunks}</a>,
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <AnalystToggleButton />
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 w-full">
          <div className="flex gap-16">
            <main className="flex-1 min-w-0 max-w-3xl space-y-8 text-sm leading-relaxed">
              <div className="rounded-lg border bg-card p-5">
                <h2 className="text-base font-medium mb-2">{t('help.title')}</h2>
                <p className="text-muted-foreground">
                  {t.rich('help.body', {
                    hemrock: richComponents.hemrock,
                    github: richComponents.github,
                  })}
                </p>
              </div>

              <nav className="xl:hidden" aria-label={t('toc')}>
                <h2 className="text-base font-medium mb-2">{t('toc')}</h2>
                {tocLinks}
              </nav>

              {SECTIONS.map(section => {
                const Icon = section.icon
                const SecondaryIcon = section.secondaryIcon
                const Heading = section.nested ? 'h3' : 'h2'
                return (
                  <section id={section.id} key={section.id} className={section.nested ? 'pl-4 border-l-2 border-border' : undefined}>
                    <Heading className={`${section.nested ? 'text-sm' : 'text-base'} font-medium mb-2 flex items-center gap-2`}>
                      {Icon && <Icon className={section.nested ? 'h-3.5 w-3.5 text-muted-foreground' : 'h-4 w-4 text-muted-foreground'} />}
                      {SecondaryIcon && <SecondaryIcon className="h-4 w-4 text-muted-foreground" />}
                      {t(`sections.${section.key}.title`)}
                    </Heading>
                    {t.rich(`sections.${section.key}.body`, richComponents)}
                  </section>
                )
              })}
            </main>

            <nav className="hidden xl:block w-48 shrink-0 text-sm" aria-label={t('toc')}>
              <div className="sticky top-8">
                <h2 className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-3">{t('toc')}</h2>
                {tocLinks}
              </div>
            </nav>
          </div>
        </div>
      </div>
      <AnalystPanel />
    </div>
  )
}
