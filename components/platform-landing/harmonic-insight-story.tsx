'use client'

import React from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import styles from './harmonic-insight-story.module.css'

type StorySceneProps = Readonly<{
  id: string
  title: string
  copy: string
  imageSrc: string
  imageAlt: string
  imageClassName?: string
  className?: string
}>

function StoryScene({
  id,
  title,
  copy,
  imageSrc,
  imageAlt,
  imageClassName = '',
  className = '',
}: StorySceneProps) {
  return (
    <section className={`${styles.scene} ${className}`} aria-labelledby={id}>
      <div className={styles.sceneCopy}>
        <h3 id={id}>{title}</h3>
        <p>{copy}</p>
      </div>
      <figure className={styles.productFrame}>
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          sizes="(max-width: 640px) 740px, (max-width: 1100px) 88vw, 1024px"
          className={`${styles.productImage} ${imageClassName}`}
        />
      </figure>
    </section>
  )
}

export function HarmonicInsightStory() {
  const t = useTranslations('PlatformLanding')

  return (
    <>
      <section className={styles.statement} aria-labelledby="institutional-statement-title">
        <div className={styles.statementGradient}>
          <div className={styles.statementInner}>
            <p className={styles.eyebrowDark}>{t('harmonic.statement.label')}</p>
            <h2 id="institutional-statement-title">{t('harmonic.statement.copy')}</h2>
          </div>
        </div>
      </section>

      <section className={styles.story} aria-labelledby="insight-copilot-title">
        <div className={styles.pastelLead} aria-hidden="true" />
        <div className={styles.darkCanvas}>
          <header className={styles.storyIntro}>
            <p className={styles.eyebrowLight}>{t('harmonic.story.eyebrow')}</p>
            <h2 id="insight-copilot-title">{t('harmonic.story.title')}</h2>
          </header>

          <div className={styles.signalBridge}>
            <div className={styles.signalChip}>
              <span className={styles.signalMark} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className={styles.signalText}>
                <strong>{t('harmonic.story.signalTitle')}</strong>
                <small>{t('harmonic.story.signalCopy')}</small>
              </span>
              <span className={styles.signalArrow} aria-hidden="true">&#8599;</span>
            </div>
          </div>

          <StoryScene
            id="signal-scene-title"
            title={t('harmonic.story.signalTitle')}
            copy={t('harmonic.story.signalCopy')}
            imageSrc="/landing/deals.png"
            imageAlt={t('images.deals')}
            className={styles.signalScene}
          />

          <StoryScene
            id="research-scene-title"
            title={t('harmonic.story.researchTitle')}
            copy={t('harmonic.story.researchCopy')}
            imageSrc="/landing/research-expert.png"
            imageAlt={t('images.research')}
            imageClassName={styles.researchImage}
            className={styles.researchScene}
          />

          <StoryScene
            id="action-scene-title"
            title={t('harmonic.story.actionTitle')}
            copy={t('harmonic.story.actionCopy')}
            imageSrc="/screenshots/dashboard.png"
            imageAlt={t('harmonic.story.actionTitle')}
            className={styles.actionScene}
          />

          <div className={styles.storyTail} aria-hidden="true" />
        </div>
      </section>

      <section className={styles.operatorQuote} aria-label={t('harmonic.quote.source')}>
        <blockquote className={styles.quoteInner}>
          <p>
            {t('harmonic.quote.prefix')}
            <span>{t('harmonic.quote.highlight')}</span>
          </p>
          <cite>{t('harmonic.quote.source')}</cite>
        </blockquote>
      </section>
    </>
  )
}
