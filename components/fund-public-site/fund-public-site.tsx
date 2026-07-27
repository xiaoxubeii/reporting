import React from 'react'
import Link from 'next/link'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ArrowRight, Globe2, LogIn, Mail } from 'lucide-react'
import type { FundPublicSiteContentV1, FundPublicSiteLocale, LocalizedText } from '@/lib/fund-public-site/content'
import { resolveLocalizedText } from '@/lib/fund-public-site/content'
import type { FundPublicSiteTemplate } from '@/lib/fund-public-site/templates'

export interface FundPublicSiteProps {
  readonly fundName: string
  readonly logoUrl: string | null
  readonly templateKey: FundPublicSiteTemplate
  readonly content: FundPublicSiteContentV1
  readonly locale: FundPublicSiteLocale
  readonly preview?: boolean
}

interface ViewModel {
  fundName: string
  logoUrl: string | null
  eyebrow: string | null
  title: string
  summary: string | null
  aboutHeading: string | null
  aboutBody: string | null
  strategyHeading: string | null
  checkSize: string | null
  sectors: string[]
  stages: string[]
  geographies: string[]
  team: Array<{ id: string; name: string; role: string | null; bio: string | null; imageUrl?: string; websiteUrl?: string }>
  portfolio: Array<{ id: string; name: string; description: string | null; logoUrl?: string; websiteUrl?: string }>
  cta: { href: string; label: string; external: boolean } | null
  visibility: FundPublicSiteContentV1['visibility']
  labels: { team: string; portfolio: string; signIn: string; lpPortal: string; poweredBy: string }
}

export function FundPublicSite(props: FundPublicSiteProps) {
  const model = toViewModel(props)
  const template = props.templateKey === 'focus'
    ? <FocusTemplate model={model} />
    : props.templateKey === 'institutional'
      ? <InstitutionalTemplate model={model} />
      : <MinimalTemplate model={model} />

  return (
    <div data-template={props.templateKey} className="min-h-screen overflow-x-hidden bg-[#f8f7f3] text-[#171815]">
      <SiteHeader model={model} preview={props.preview} />
      {template}
      <SiteFooter model={model} />
    </div>
  )
}

export function FundPublicSitePrivateState({
  fundName,
  logoUrl,
  locale,
}: {
  fundName: string
  logoUrl: string | null
  locale: FundPublicSiteLocale
}) {
  const zh = locale === 'zh-CN'
  return (
    <main className="min-h-screen bg-[#f8f7f3] text-[#171815] flex flex-col" data-public-site-state="private">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 md:px-10">
        <Brand fundName={fundName} logoUrl={logoUrl} />
        <div className="flex items-center gap-1">
          <LanguageSwitcher compact className="text-black/55 hover:bg-black/5 hover:text-black" />
          <Link href="/auth" className="inline-flex items-center gap-2 rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black hover:text-white">
            <LogIn className="h-4 w-4" /> {zh ? '登录' : 'Sign in'}
          </Link>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-black/45">{zh ? '基金网站' : 'Fund website'}</p>
        <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] md:text-6xl">{fundName}</h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-black/55 md:text-lg">
          {zh ? '公开网站尚未发布。成员可登录工作区。' : 'The public website has not been published yet. Members can sign in to the workspace.'}
        </p>
      </div>
      <div className="px-6 py-8 text-center text-xs text-black/35">Powered by FundWorkspace</div>
    </main>
  )
}

function FocusTemplate({ model }: { model: ViewModel }) {
  return (
    <main>
      <section className="mx-auto grid min-h-[62vh] max-w-6xl items-end gap-10 px-6 pb-16 pt-20 md:grid-cols-[1.25fr_.75fr] md:px-10 md:pb-24 md:pt-28">
        <div>
          {model.eyebrow && <p className="mb-6 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-800">{model.eyebrow}</p>}
          <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-[.98] tracking-[-0.055em] md:text-7xl lg:text-8xl">{model.title}</h1>
          {model.summary && <p className="mt-8 max-w-2xl text-lg leading-8 text-black/58 md:text-xl">{model.summary}</p>}
        </div>
        <div className="md:pb-2"><PrimaryCta cta={model.cta} /></div>
      </section>
      {model.visibility.strategy && <StrategySection model={model} className="bg-[#173f34] text-white" />}
      {model.visibility.about && model.aboutBody && <AboutSection model={model} />}
      {model.visibility.portfolio && model.portfolio.length > 0 && <PortfolioSection model={model} />}
      {model.visibility.team && model.team.length > 0 && <TeamSection model={model} />}
    </main>
  )
}

function InstitutionalTemplate({ model }: { model: ViewModel }) {
  return (
    <main>
      <section className="border-y border-black/10 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:px-10 md:py-28">
          <div>
            {model.eyebrow && <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-black/45">{model.eyebrow}</p>}
            <h1 className="text-balance text-5xl font-medium leading-[1.03] tracking-[-0.045em] md:text-7xl">{model.title}</h1>
          </div>
          <div className="flex flex-col justify-end">
            {model.summary && <p className="text-lg leading-8 text-black/60">{model.summary}</p>}
            <div className="mt-8"><PrimaryCta cta={model.cta} /></div>
          </div>
        </div>
      </section>
      {model.visibility.about && model.aboutBody && <AboutSection model={model} />}
      {model.visibility.strategy && <StrategySection model={model} className="border-y border-black/10 bg-[#eceae3]" />}
      {model.visibility.portfolio && model.portfolio.length > 0 && <PortfolioSection model={model} />}
      {model.visibility.team && model.team.length > 0 && <TeamSection model={model} />}
    </main>
  )
}

function MinimalTemplate({ model }: { model: ViewModel }) {
  const focus = [...model.sectors, ...model.stages, ...model.geographies]
  return (
    <main className="mx-auto flex min-h-[72vh] max-w-4xl flex-col justify-center px-6 py-20 md:px-10 md:py-28">
      {model.eyebrow && <p className="mb-6 text-xs font-semibold uppercase tracking-[0.25em] text-black/40">{model.eyebrow}</p>}
      <h1 className="text-balance text-5xl font-medium leading-[1.02] tracking-[-0.055em] md:text-7xl">{model.title}</h1>
      {model.summary && <p className="mt-8 max-w-2xl text-lg leading-8 text-black/58 md:text-xl">{model.summary}</p>}
      {model.visibility.about && model.aboutBody && <p className="mt-10 max-w-2xl whitespace-pre-line text-base leading-7 text-black/65">{model.aboutBody}</p>}
      {model.visibility.strategy && focus.length > 0 && (
        <div className="mt-10 flex flex-wrap gap-2">
          {focus.map(item => <span key={item} className="rounded-full border border-black/15 px-3 py-1.5 text-sm text-black/65">{item}</span>)}
        </div>
      )}
      <div className="mt-12"><PrimaryCta cta={model.cta} /></div>
    </main>
  )
}

function SiteHeader({ model, preview }: { model: ViewModel; preview?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-6 md:px-10">
      <Brand fundName={model.fundName} logoUrl={model.logoUrl} />
      <nav className="flex items-center gap-2" aria-label="Fund access">
        {preview && <span className="hidden rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 sm:inline">Draft preview</span>}
        {!preview && <LanguageSwitcher compact className="text-black/55 hover:bg-black/5 hover:text-black" />}
        {model.visibility.lpLogin && (
          <Link href="/portal" className="hidden rounded-full px-3 py-2 text-sm text-black/55 hover:text-black sm:inline-flex">{model.labels.lpPortal}</Link>
        )}
        <Link href="/auth" className="inline-flex items-center gap-2 rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black hover:text-white">
          <LogIn className="h-4 w-4" /> {model.labels.signIn}
        </Link>
      </nav>
    </header>
  )
}

function Brand({ fundName, logoUrl }: { fundName: string; logoUrl: string | null }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3 font-semibold tracking-[-0.02em]">
      {logoUrl && <img src={logoUrl} alt="" referrerPolicy="no-referrer" className="h-9 w-auto max-w-[120px] object-contain" />}
      <span className="truncate">{fundName}</span>
    </Link>
  )
}

function StrategySection({ model, className }: { model: ViewModel; className: string }) {
  const groups = [
    { label: model.strategyHeading, values: model.sectors },
    { label: model.labels.portfolio === 'Portfolio' ? 'Stage' : '阶段', values: model.stages },
    { label: model.labels.portfolio === 'Portfolio' ? 'Geography' : '地区', values: model.geographies },
    { label: model.labels.portfolio === 'Portfolio' ? 'Typical check' : '投资规模', values: model.checkSize ? [model.checkSize] : [] },
  ].filter(group => group.values.length)
  if (groups.length === 0) return null
  return (
    <section className={className}>
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 sm:grid-cols-2 md:px-10 md:py-20 lg:grid-cols-4">
        {groups.map(group => (
          <div key={group.label}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">{group.label}</h2>
            <div className="mt-4 space-y-2 text-lg">{group.values.map(value => <p key={value}>{value}</p>)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function AboutSection({ model }: { model: ViewModel }) {
  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-[.65fr_1.35fr] md:px-10 md:py-24">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">{model.aboutHeading}</h2>
      <p className="max-w-3xl whitespace-pre-line text-2xl leading-10 tracking-[-0.02em] text-black/75 md:text-3xl md:leading-[1.45]">{model.aboutBody}</p>
    </section>
  )
}

function PortfolioSection({ model }: { model: ViewModel }) {
  return (
    <section className="border-t border-black/10 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-24">
        <h2 className="text-3xl font-medium tracking-[-0.035em]">{model.labels.portfolio}</h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-3">
          {model.portfolio.map(item => (
            <SafeCardLink key={item.id} href={item.websiteUrl} className="min-h-44 bg-white p-6">
              {item.logoUrl && <img src={item.logoUrl} alt="" referrerPolicy="no-referrer" className="mb-8 h-9 max-w-[120px] object-contain" />}
              <h3 className="text-lg font-semibold">{item.name}</h3>
              {item.description && <p className="mt-2 text-sm leading-6 text-black/55">{item.description}</p>}
            </SafeCardLink>
          ))}
        </div>
      </div>
    </section>
  )
}

function TeamSection({ model }: { model: ViewModel }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-24">
      <h2 className="text-3xl font-medium tracking-[-0.035em]">{model.labels.team}</h2>
      <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {model.team.map(person => (
          <SafeCardLink key={person.id} href={person.websiteUrl} className="group">
            {person.imageUrl && <img src={person.imageUrl} alt="" referrerPolicy="no-referrer" className="aspect-[4/3] w-full rounded-2xl bg-black/5 object-cover" />}
            <h3 className="mt-4 text-lg font-semibold">{person.name}</h3>
            {person.role && <p className="mt-1 text-sm text-black/50">{person.role}</p>}
            {person.bio && <p className="mt-3 text-sm leading-6 text-black/60">{person.bio}</p>}
          </SafeCardLink>
        ))}
      </div>
    </section>
  )
}

function PrimaryCta({ cta }: { cta: ViewModel['cta'] }) {
  if (!cta) return null
  const contents = <>{cta.label}{cta.href.startsWith('mailto:') ? <Mail className="h-4 w-4" /> : cta.external ? <Globe2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}</>
  const classes = 'inline-flex items-center gap-2 rounded-full bg-[#171815] px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5'
  return cta.external
    ? <a href={cta.href} target="_blank" rel="noopener noreferrer" className={classes}>{contents}</a>
    : <Link href={cta.href} className={classes}>{contents}</Link>
}

function SafeCardLink({ href, className, children }: { href?: string; className: string; children: React.ReactNode }) {
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
    : <div className={className}>{children}</div>
}

function SiteFooter({ model }: { model: ViewModel }) {
  return (
    <footer className="border-t border-black/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-xs text-black/40 sm:flex-row sm:items-center sm:justify-between md:px-10">
        <span>© {new Date().getFullYear()} {model.fundName}</span>
        <span>{model.labels.poweredBy}</span>
      </div>
    </footer>
  )
}

function toViewModel(props: FundPublicSiteProps): ViewModel {
  const { content, locale } = props
  const text = (value: LocalizedText | undefined) => resolveLocalizedText(value, locale, content.defaultLocale)
  const zh = locale === 'zh-CN'
  const ctaLabel = text(content.contact.ctaLabel)
  let cta: ViewModel['cta'] = null
  if (content.visibility.contact && ctaLabel) {
    if (content.contact.ctaKind === 'email' && content.contact.email) cta = { href: `mailto:${content.contact.email}`, label: ctaLabel, external: false }
    if (content.contact.ctaKind === 'website' && content.contact.websiteUrl) cta = { href: content.contact.websiteUrl, label: ctaLabel, external: true }
    if (content.contact.ctaKind === 'auth') cta = { href: '/auth', label: ctaLabel, external: false }
    if (content.contact.ctaKind === 'portal') cta = { href: '/portal', label: ctaLabel, external: false }
  }
  return {
    fundName: props.fundName,
    logoUrl: props.logoUrl,
    eyebrow: text(content.hero.eyebrow),
    title: text(content.hero.title) ?? props.fundName,
    summary: text(content.hero.summary),
    aboutHeading: text(content.about.heading),
    aboutBody: text(content.about.body),
    strategyHeading: text(content.strategy.heading),
    checkSize: text(content.strategy.checkSize),
    sectors: content.strategy.sectors,
    stages: content.strategy.stages,
    geographies: content.strategy.geographies,
    team: content.team.map(person => ({ ...person, role: text(person.role), bio: text(person.bio) })),
    portfolio: content.portfolio.map(item => ({ ...item, description: text(item.description) })),
    cta,
    visibility: content.visibility,
    labels: {
      team: zh ? '团队' : 'Team',
      portfolio: zh ? '投资组合' : 'Portfolio',
      signIn: zh ? '登录' : 'Sign in',
      lpPortal: zh ? 'LP 门户' : 'LP Portal',
      poweredBy: zh ? '由 FundWorkspace 提供支持' : 'Powered by FundWorkspace',
    },
  }
}
