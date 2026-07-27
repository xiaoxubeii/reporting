import React from 'react'
import type { PlatformLandingConfig } from '@/lib/platform-landing/config'
import { HarmonicCapabilities, HarmonicFooter } from './harmonic-capabilities'
import foundation from './harmonic-foundation.module.css'
import { HarmonicInsightStory } from './harmonic-insight-story'
import { HarmonicHero, HarmonicNavigation } from './harmonic-navigation-hero'

export function PlatformLanding({ config }: { readonly config: Readonly<PlatformLandingConfig> }) {
  return (
    <div className={foundation.landing}>
      <HarmonicNavigation config={config} />
      <main>
        <HarmonicHero config={config} />
        <HarmonicInsightStory />
        <HarmonicCapabilities />
      </main>
      <HarmonicFooter config={config} />
    </div>
  )
}
