import { ogMetadata } from '@/lib/og-metadata'
import Image from 'next/image'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import {
  Github,
  Play,
  Mail,
  Upload,
  BarChart3,
  Brain,
  Handshake,
  FileText,
  ChevronRight,
  Lightbulb,
  Database,
  ShieldUser,
  Users,
  Calendar,
  Send,
  StickyNote,
  MessageCircle,
  FolderOpen,
  ShieldCheck,
  LineChart,
  Briefcase,
  Microscope,
  Lock,
  Calculator,
  type LucideIcon,
} from 'lucide-react'
import { CalendlyButton } from '@/components/calendly-button'
import { SubscriptionInquiryButton } from '@/components/subscription-inquiry-modal'

type StepDefinition = {
  icon: LucideIcon
  href: string
  screenshot: string
}

const STEPS: readonly StepDefinition[] = [
  { icon: Mail, href: '/inbound-explainer', screenshot: '/screenshots/inbound-cropped.png' },
  { icon: Upload, href: '/import-explainer', screenshot: '/screenshots/import-cropped.png' },
  { icon: LineChart, href: '/dashboard-explainer', screenshot: '/screenshots/company-metrics-cropped.png' },
  { icon: BarChart3, href: '/investments-explainer', screenshot: '/screenshots/investments-cropped.png' },
  { icon: StickyNote, href: '/notes-explainer', screenshot: '/screenshots/notes-cropped.png' },
  { icon: MessageCircle, href: '/dashboard-explainer', screenshot: '/screenshots/company-cropped.png' },
  { icon: Handshake, href: '/interactions-explainer', screenshot: '/screenshots/interactions-cropped.png' },
  { icon: Briefcase, href: '/deals-explainer', screenshot: '/screenshots/deals.png' },
  { icon: Microscope, href: '/diligence-explainer', screenshot: '/screenshots/diligence.png' },
  { icon: FileText, href: '/letters-explainer', screenshot: '/screenshots/letters-cropped.png' },
  { icon: Calculator, href: '/funds-explainer', screenshot: '/screenshots/funds.png' },
  { icon: Lock, href: '/lp-portal-explainer', screenshot: '/screenshots/lp-portal.png' },
  { icon: FolderOpen, href: '/dashboard-explainer', screenshot: '/screenshots/dashboard-cropped.png' },
  { icon: ShieldCheck, href: '/compliance-explainer', screenshot: '/screenshots/compliance-cropped.png' },
] as const

const WHY_CARDS = [
  { icon: Database, key: 'data' },
  { icon: Brain, key: 'ai' },
  { icon: ShieldUser, key: 'operations' },
  { icon: Users, key: 'funds' },
] as const

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export async function generateMetadata() {
  const t = await getTranslations('PublicHome.metadata')
  return ogMetadata({ title: t('title'), description: t('description') })
}

export default async function HomePage() {
  const t = await getTranslations('PublicHome')
  const faqItems = [1, 2, 3, 4, 5, 6, 7] as const

  const faqAnswer = (item: (typeof faqItems)[number]) => t.rich(`faq.items.${item}.answer`, {
    financialModels: chunks => <a href="https://www.hemrock.com/downloads" className="underline hover:text-foreground">{chunks}</a>,
    license: chunks => <a href="https://github.com/tdavidson/reporting/blob/main/LICENSE.md" className="underline hover:text-foreground">{chunks}</a>,
    contact: chunks => <Link href="/contact" className="underline hover:text-foreground">{chunks}</Link>,
  })

  return (
    <div className="p-4 pt-6 md:p-8">
      <h1 className="text-4xl md:text-7xl font-semibold tracking-tight mb-2 max-w-3xl">{t('hero.title')}</h1>
      <p className="text-xl text-muted-foreground mb-12 max-w-2xl">{t('hero.description')}</p>

      <section className="mb-16">
        <h2 className="text-2xl font-semibold tracking-tight mb-8">{t('workflow.title')}</h2>
        <div className="relative">
          <div className="absolute left-[19px] top-8 bottom-8 w-px bg-border hidden md:block" />
          <div className="space-y-8 md:space-y-12">
            {STEPS.map(({ icon: Icon, href, screenshot }, index) => {
              const item = (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14
              const title = t(`workflow.steps.${item}.title`)
              return (
                <Link key={item} href={href} className="group block">
                  <div className="flex gap-4 md:gap-6 items-start">
                    <div className="relative z-10 shrink-0">
                      <div className="h-10 w-10 rounded-full border-2 border-border bg-background flex items-center justify-center group-hover:border-foreground transition-colors">
                        <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{item}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <h3 className="text-base font-medium group-hover:text-foreground transition-colors">{title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3 max-w-xl">{t(`workflow.steps.${item}.description`)}</p>
                      <div className="relative h-[200px] md:h-[280px] rounded-lg border shadow-sm overflow-hidden">
                        <Image src={screenshot} alt={title} fill sizes="(max-width: 768px) 100vw, 80vw" className="object-cover object-left-top" />
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold tracking-tight mb-6">{t('why.title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {WHY_CARDS.map(({ icon: Icon, key }) => (
            <div key={key} className="rounded-lg border p-5">
              <Icon className="h-5 w-5 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">{t(`why.cards.${key}.title`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`why.cards.${key}.description`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight mb-2">{t('pricing.title')}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t.rich('pricing.license', {
            license: chunks => <a href="https://github.com/tdavidson/reporting/blob/main/LICENSE.md" className="underline hover:text-foreground">{chunks}</a>,
          })}
        </p>
        <div className="rounded-lg border bg-muted/50 p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-base text-muted-foreground flex-1">{t('pricing.demo.description')}</p>
          <Button asChild size="lg" className="shrink-0">
            <a href="https://portfolio.hemrock.com/demo" target="_blank" rel="noopener noreferrer" className="gap-2">
              <Play className="h-4 w-4" />
              {t('pricing.demo.action')}
            </a>
          </Button>
        </div>
        <div className="h-8 md:h-12" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border-2 border-foreground p-6 flex flex-col relative">
            <span className="absolute -top-3 left-4 bg-foreground text-background text-xs font-medium px-2.5 py-0.5 rounded-full">{t('pricing.plans.selfHosted.badge')}</span>
            <h3 className="font-semibold mb-1">{t('pricing.plans.selfHosted.title')}</h3>
            <p className="text-2xl font-bold mb-1">{t('pricing.plans.selfHosted.price')}</p>
            <p className="text-xs text-muted-foreground mb-3">{t('pricing.plans.selfHosted.subtitle')}</p>
            <ul className="text-sm text-muted-foreground space-y-1.5 mb-4 flex-1">
              <li>{t('pricing.plans.selfHosted.features.1')}</li>
              <li>{t('pricing.plans.selfHosted.features.2')}</li>
              <li>{t('pricing.plans.selfHosted.features.3')}</li>
              <li>{t('pricing.plans.selfHosted.features.4')}</li>
              <li>{t('pricing.plans.selfHosted.features.5')}</li>
            </ul>
            <Button size="sm" asChild className="w-full">
              <a href="https://github.com/tdavidson/reporting" className="gap-2"><Github className="h-4 w-4" />{t('pricing.plans.selfHosted.action')}</a>
            </Button>
          </div>
          <div className="rounded-lg border p-6 flex flex-col">
            <h3 className="font-semibold mb-1">{t('pricing.plans.support.title')}</h3>
            <p className="text-2xl font-bold mb-1">{t('pricing.plans.support.price')}</p>
            <p className="text-xs text-muted-foreground mb-3">{t('pricing.plans.support.subtitle')}</p>
            <ul className="text-sm text-muted-foreground space-y-1.5 mb-4 flex-1">
              <li>{t('pricing.plans.support.features.1')}</li>
              <li>{t('pricing.plans.support.features.2')}</li>
              <li>{t('pricing.plans.support.features.3')}</li>
              <li>{t('pricing.plans.support.features.4')}</li>
            </ul>
            <CalendlyButton url="https://calendly.com/foresighthq/15min" className="w-full"><Calendar className="h-4 w-4 mr-1.5" />{t('pricing.plans.support.action')}</CalendlyButton>
          </div>
          <div className="rounded-lg border p-6 flex flex-col relative">
            <span className="absolute -top-3 left-4 bg-muted text-muted-foreground text-xs font-medium px-2.5 py-0.5 rounded-full">{t('pricing.plans.hosted.badge')}</span>
            <h3 className="font-semibold mb-1">{t('pricing.plans.hosted.title')}</h3>
            <p className="text-2xl font-bold mb-1">{t('pricing.plans.hosted.price')}</p>
            <p className="text-xs text-muted-foreground mb-3">{t('pricing.plans.hosted.subtitle')}</p>
            <ul className="text-sm text-muted-foreground space-y-1.5 mb-4 flex-1">
              <li>{t('pricing.plans.hosted.features.1')}</li>
              <li>{t('pricing.plans.hosted.features.2')}</li>
              <li>{t('pricing.plans.hosted.features.3')}</li>
              <li>{t('pricing.plans.hosted.features.4')}</li>
            </ul>
            <SubscriptionInquiryButton variant="outline" size="sm" className="w-full"><Send className="h-3.5 w-3.5 mr-1.5" />{t('pricing.plans.hosted.action')}</SubscriptionInquiryButton>
          </div>
        </div>
      </section>

      <section className="mb-12 mt-12">
        <h2 className="text-2xl font-semibold tracking-tight mb-6">{t('faq.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          {[faqItems.slice(0, 4), faqItems.slice(4)].map((column, columnIndex) => (
            <div className="space-y-1" key={columnIndex}>
              {column.map(item => (
                <details key={item} className="group">
                  <summary className="flex cursor-pointer items-center gap-3 py-3 text-lg font-medium [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-open:rotate-90" />
                    {t(`faq.items.${item}.question`)}
                  </summary>
                  <p className="pl-7 pb-3 text-base text-muted-foreground">{faqAnswer(item)}</p>
                </details>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-3 rounded-lg border bg-muted/50 p-5">
            <div className="flex items-start gap-4">
              <Image src="/tdavidson.jpg" alt="Taylor Davidson" width={128} height={128} className="rounded-lg shrink-0" />
              <div className="flex sm:hidden flex-col justify-center h-[128px]">
                <p className="font-medium text-base mb-2">Taylor Davidson</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li><a href="https://github.com/tdavidson" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-foreground transition-colors"><Github className="h-4 w-4 shrink-0" /><span>github.com/tdavidson</span></a></li>
                  <li><a href="https://x.com/tdavidson" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-foreground transition-colors"><XIcon className="h-4 w-4 shrink-0" /><span>x.com/tdavidson</span></a></li>
                </ul>
              </div>
              <p className="hidden sm:block text-base text-muted-foreground">
                {t.rich('about.desktop', {
                  name: chunks => <strong className="text-foreground">{chunks}</strong>,
                  hemrock: chunks => <a href="https://www.hemrock.com" className="underline hover:text-foreground">{chunks}</a>,
                  laconia: chunks => <a href="https://laconiacapitalgroup.com" className="underline hover:text-foreground">{chunks}</a>,
                  about: chunks => <a href="https://www.hemrock.com/about" className="underline hover:text-foreground">{chunks}</a>,
                })}
              </p>
            </div>
            <p className="sm:hidden text-base text-muted-foreground mt-3">
              {t.rich('about.mobile', {
                hemrock: chunks => <a href="https://www.hemrock.com" className="underline hover:text-foreground">{chunks}</a>,
                laconia: chunks => <a href="https://laconiacapitalgroup.com" className="underline hover:text-foreground">{chunks}</a>,
                about: chunks => <a href="https://www.hemrock.com/about" className="underline hover:text-foreground">{chunks}</a>,
              })}
            </p>
          </div>
          <a href="https://foresight.is/fractional-cfo/" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3 flex items-start gap-3 transition-colors hover:bg-amber-100 dark:hover:bg-amber-950/60">
            <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{t('about.cfo.body')} <span className="text-foreground underline underline-offset-4">{t('about.cfo.link')}</span>.</p>
          </a>
        </div>
      </section>
    </div>
  )
}
