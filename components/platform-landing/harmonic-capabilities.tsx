import React from 'react'
import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { PlatformLandingConfig } from '@/lib/platform-landing/config'
import {
  ACT_CARDS,
  DISCOVER_CARDS,
  RESEARCH_CARDS,
} from '@/lib/platform-landing/harmonic-content'
import { ExistingWorkspace } from './existing-workspace'
import styles from './harmonic-capabilities.module.css'

type CardKey =
  | (typeof DISCOVER_CARDS)[number]
  | (typeof RESEARCH_CARDS)[number]
  | (typeof ACT_CARDS)[number]

interface ProductCardProps {
  readonly cardKey: CardKey
  readonly image: string
  readonly sizes: string
  readonly tall?: boolean
}

const DISCOVER_IMAGES = [
  '/screenshots/home.png',
  '/landing/deals.png',
  '/screenshots/inbound.png',
] as const

const RESEARCH_IMAGES = [
  '/landing/research-expert.png',
  '/screenshots/diligence.png',
] as const

const ACT_IMAGES = [
  '/screenshots/review.png',
  '/landing/lp-portal.png',
] as const

function ProductCard({ cardKey, image, sizes, tall = false }: ProductCardProps) {
  const t = useTranslations('PlatformLanding')
  const title = t(`harmonic.cards.${cardKey}.title`)
  const alt = image === '/landing/deals.png'
    ? t('images.deals')
    : image === '/landing/research-expert.png'
      ? t('images.research')
      : image === '/landing/lp-portal.png'
        ? t('images.lpPortal')
        : `${title} — FundWorkspace`

  return (
    <article className={`${styles.productCard} ${tall ? styles.tallCard : ''}`}>
      <div className={styles.cardCopy}>
        <h3>{title}</h3>
        <p>{t(`harmonic.cards.${cardKey}.description`)}</p>
      </div>
      <div className={styles.cardImage}>
        <Image
          src={image}
          alt={alt}
          fill
          sizes={sizes}
          className={styles.productScreenshot}
        />
      </div>
    </article>
  )
}

function SectionHeader({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <header className={styles.sectionHeader}>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  )
}

function DiscoverSection() {
  const t = useTranslations('PlatformLanding')

  return (
    <section id="platform" className={styles.capabilitySection}>
      <div className={styles.sectionInner}>
        <SectionHeader
          title={t('capabilities.items.discover.title')}
          description={t('harmonic.sectionDescriptions.discover')}
        />
        <div className={styles.threeColumnGrid}>
          {DISCOVER_CARDS.map((cardKey, index) => (
            <ProductCard
              key={cardKey}
              cardKey={cardKey}
              image={DISCOVER_IMAGES[index]}
              sizes="(max-width: 767px) calc(100vw - 40px), 369px"
              tall
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function ResearchSection() {
  const t = useTranslations('PlatformLanding')

  return (
    <section id="experts" className={styles.capabilitySection}>
      <div className={styles.sectionInner}>
        <SectionHeader
          title={t('experts.title')}
          description={t('experts.description')}
        />
        <div className={styles.twoColumnGrid}>
          {RESEARCH_CARDS.map((cardKey, index) => (
            <ProductCard
              key={cardKey}
              cardKey={cardKey}
              image={RESEARCH_IMAGES[index]}
              sizes="(max-width: 767px) calc(100vw - 40px), 558px"
              tall
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function ActSection() {
  const t = useTranslations('PlatformLanding')

  return (
    <section id="workflow" className={styles.capabilitySection}>
      <div className={styles.sectionInner}>
        <SectionHeader
          title={t('capabilities.items.decide.title')}
          description={t('harmonic.sectionDescriptions.act')}
        />
        <div className={styles.twoColumnGrid}>
          {ACT_CARDS.map((cardKey, index) => (
            <ProductCard
              key={cardKey}
              cardKey={cardKey}
              image={ACT_IMAGES[index]}
              sizes="(max-width: 767px) calc(100vw - 40px), 558px"
              tall
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function PrivacyDiagram() {
  return (
    <div className={styles.privacyDiagram} aria-hidden="true">
      <span className={styles.privacyOrbit} />
      <span className={styles.privacyLock} />
      <span className={styles.privacyDotOne} />
      <span className={styles.privacyDotTwo} />
      <span className={styles.privacyDotThree} />
    </div>
  )
}

function ProvenanceDiagram() {
  return (
    <div className={styles.provenanceDiagram} aria-hidden="true">
      <span className={styles.provenanceLine} />
      <span className={`${styles.provenanceNode} ${styles.nodeSource}`}>S</span>
      <span className={`${styles.provenanceNode} ${styles.nodeAi}`}>AI</span>
      <span className={`${styles.provenanceNode} ${styles.nodeExpert}`}>E</span>
      <span className={`${styles.provenanceNode} ${styles.nodeDecision}`}>D</span>
    </div>
  )
}

function ReadySection() {
  const t = useTranslations('PlatformLanding')

  return (
    <section id="trust" className={`${styles.capabilitySection} ${styles.readySection}`}>
      <div className={styles.sectionInner}>
        <SectionHeader title={t('trust.title')} description={t('harmonic.sectionDescriptions.ready')} />

        <div className={styles.readyGrid}>
          <article className={`${styles.productCard} ${styles.collaborationCard}`}>
            <div className={styles.cardCopy}>
              <h3>{t('harmonic.cards.collaboration.title')}</h3>
              <p>{t('harmonic.cards.collaboration.description')}</p>
            </div>
            <div className={`${styles.cardImage} ${styles.collaborationImage}`}>
              <Image
                src="/screenshots/dashboard.png"
                alt={`${t('harmonic.cards.collaboration.title')} — FundWorkspace`}
                fill
                sizes="(max-width: 767px) calc(100vw - 40px), 1124px"
                className={styles.productScreenshot}
              />
            </div>
          </article>

          <div className={styles.readyLowerGrid}>
            <div className={styles.readySmallStack}>
              <article className={`${styles.productCard} ${styles.diagramCard}`}>
                <div className={styles.diagramCopy}>
                  <h3>{t('harmonic.cards.privacy.title')}</h3>
                  <p>{t('harmonic.cards.privacy.description')}</p>
                </div>
                <PrivacyDiagram />
              </article>
              <article className={`${styles.productCard} ${styles.diagramCard}`}>
                <div className={styles.diagramCopy}>
                  <h3>{t('harmonic.cards.provenance.title')}</h3>
                  <p>{t('harmonic.cards.provenance.description')}</p>
                </div>
                <ProvenanceDiagram />
              </article>
            </div>

            <article className={`${styles.productCard} ${styles.memoryCard}`}>
              <div className={styles.cardCopy}>
                <h3>{t('harmonic.cards.institutionalMemory.title')}</h3>
                <p>{t('harmonic.cards.institutionalMemory.description')}</p>
              </div>
              <div className={styles.cardImage}>
                <Image
                  src="/screenshots/notes.png"
                  alt={`${t('harmonic.cards.institutionalMemory.title')} — FundWorkspace`}
                  fill
                  sizes="(max-width: 767px) calc(100vw - 40px), 562px"
                  className={styles.productScreenshot}
                />
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  )
}

function StoriesSection() {
  const t = useTranslations('PlatformLanding')
  const stories = [
    {
      title: t('harmonic.stories.firstTitle'),
      copy: t('harmonic.stories.firstCopy'),
      image: '/landing/research-expert.png',
    },
    {
      title: t('harmonic.stories.secondTitle'),
      copy: t('harmonic.stories.secondCopy'),
      image: '/landing/lp-portal.png',
    },
  ] as const

  return (
    <section id="stories" className={styles.storiesSection}>
      <div className={styles.storiesInner}>
        <header className={styles.storiesHeader}>
          <p>{t('harmonic.stories.eyebrow')}</p>
          <h2>{t('harmonic.stories.title')}</h2>
        </header>

        <div className={styles.storyList}>
          {stories.map((story, index) => (
            <article key={story.title} className={styles.storyCard}>
              <div className={styles.storyImage}>
                <Image
                  src={story.image}
                  alt={`${story.title} — FundWorkspace`}
                  fill
                  sizes="(max-width: 767px) calc(100vw - 40px), 506px"
                  className={styles.storyScreenshot}
                />
              </div>
              <div className={styles.storyCopy}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{story.title}</h3>
                  <p>{story.copy}</p>
                </div>
                <a href={index === 0 ? '#platform' : '#workflow'} aria-label={story.title}>
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export function HarmonicFooter({ config }: { readonly config: Readonly<PlatformLandingConfig> }) {
  const t = useTranslations('PlatformLanding')

  return (
    <footer className={styles.footerOuter}>
      <div className={styles.footerCard}>
        <div className={styles.footerCta}>
          <p>{t('harmonic.footer.subtle')}</p>
          <h2>{t('harmonic.footer.title')}</h2>
          <div className={styles.footerActions}>
            {config.demoUrl && (
              <a
                href={config.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.demoPill}
              >
                {t('actions.demo')}
                <ArrowUpRight aria-hidden="true" />
              </a>
            )}
            <ExistingWorkspace platformOrigin={config.platformOrigin} className={styles.workspaceButton} />
          </div>
        </div>

        <div className={styles.footerNavigation}>
          <a href="#top" className={styles.footerBrand}>FundWorkspace</a>
          <nav aria-label={t('nav.label')} className={styles.footerLinks}>
            <a href="#platform">{t('harmonic.footer.platform')}</a>
            <a href="#workflow">{t('harmonic.footer.workflow')}</a>
            <a href="#experts">{t('nav.experts')}</a>
            <a href="#trust">{t('harmonic.footer.company')}</a>
          </nav>
        </div>

        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} FundWorkspace</span>
          <span>{t('harmonic.footer.copyright')}</span>
        </div>
      </div>
    </footer>
  )
}

export function HarmonicCapabilities() {
  return (
    <>
      <div className={styles.capabilitiesWrap}>
        <DiscoverSection />
        <ResearchSection />
        <ActSection />
        <ReadySection />
      </div>
      <StoriesSection />
    </>
  )
}
