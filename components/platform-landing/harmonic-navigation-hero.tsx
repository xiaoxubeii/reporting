'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LanguageSwitcher } from '@/components/language-switcher'
import { CONNECTED_SURFACES } from '@/lib/platform-landing/harmonic-content'
import type { PlatformLandingConfig } from '@/lib/platform-landing/config'
import { ExistingWorkspace } from './existing-workspace'
import styles from './harmonic-navigation-hero.module.css'

function Wordmark() {
  return (
    <a href="#top" className={styles.wordmark} aria-label="FundWorkspace">
      <span className={styles.logoMark} aria-hidden="true" />
      <span>FundWorkspace</span>
    </a>
  )
}

export function HarmonicNavigation({
  config,
}: {
  readonly config: Readonly<PlatformLandingConfig>
}) {
  const t = useTranslations('PlatformLanding')
  const [floatingVisible, setFloatingVisible] = useState(false)

  useEffect(() => {
    const updateFloatingNavigation = () => setFloatingVisible(window.scrollY > 520)
    updateFloatingNavigation()
    window.addEventListener('scroll', updateFloatingNavigation, { passive: true })
    return () => window.removeEventListener('scroll', updateFloatingNavigation)
  }, [])

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Wordmark />
          <nav className={styles.nav} aria-label={t('nav.label')}>
            <a href="#platform">{t('nav.platform')}</a>
            <a href="#workflow">{t('nav.workflow')}</a>
            <a href="#experts">{t('nav.experts')}</a>
            <a href="#trust">{t('nav.trust')}</a>
          </nav>
          <div className={styles.headerActions}>
            <LanguageSwitcher compact className={styles.languageSwitcher} />
            <ExistingWorkspace
              platformOrigin={config.platformOrigin}
              className={styles.workspaceLink}
            />
            {config.demoUrl && (
              <a
                href={config.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.headerDemo}
              >
                {t('actions.demo')}
              </a>
            )}
          </div>
        </div>
      </header>

      <div
        className={`${styles.floatingNav} ${floatingVisible ? styles.floatingNavVisible : ''}`}
        aria-hidden={!floatingVisible}
      >
        <Wordmark />
        <nav className={styles.floatingLinks} aria-label={t('nav.label')}>
          <a href="#platform">{t('nav.platform')}</a>
          <a href="#experts">{t('nav.experts')}</a>
          <a href="#trust">{t('nav.trust')}</a>
        </nav>
        <ExistingWorkspace
          platformOrigin={config.platformOrigin}
          className={styles.floatingWorkspace}
        />
      </div>
    </>
  )
}

export function HarmonicHero({
  config,
}: {
  readonly config: Readonly<PlatformLandingConfig>
}) {
  const t = useTranslations('PlatformLanding')

  return (
    <>
      <section id="top" className={styles.hero}>
        <div className={styles.heroContent}>
          <h1>{t('hero.title')}</h1>
          <p>{t('hero.description')}</p>
          <div className={styles.heroActions}>
            {config.demoUrl && (
              <a
                href={config.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.primaryAction}
              >
                {t('actions.demo')}
                <ArrowRight aria-hidden="true" />
              </a>
            )}
            <ExistingWorkspace
              platformOrigin={config.platformOrigin}
              className={styles.heroWorkspaceLink}
            />
          </div>
          <figure className={styles.productFrame}>
            <Image
              src="/landing/research-expert.png"
              alt={t('images.research')}
              width={1440}
              height={2585}
              priority
              sizes="(max-width: 767px) 720px, 1024px"
              className={styles.productImage}
            />
          </figure>
        </div>
      </section>

      <section className={styles.connected} aria-labelledby="connected-surfaces-title">
        <p id="connected-surfaces-title" className={styles.connectedLabel}>
          {t('harmonic.connectedLabel')}
        </p>
        <div className={styles.connectedGrid}>
          {CONNECTED_SURFACES.map(surface => (
            <div className={styles.connectedCell} key={surface}>
              <span className={styles.surfaceMark} aria-hidden="true" />
              <span>{t(`harmonic.surfaces.${surface}`)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
