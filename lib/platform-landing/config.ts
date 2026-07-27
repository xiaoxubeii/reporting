import { loadDemoUrl } from './demo-url'

export interface PlatformLandingConfig {
  readonly demoUrl: string | null
  readonly platformOrigin: string
}

export function createPlatformLandingConfig(options: {
  readonly demoUrl: string | undefined
  readonly hosted: boolean
  readonly platformOrigin: string
  readonly warn?: (message: string) => void
}): Readonly<PlatformLandingConfig> {
  return Object.freeze({
    demoUrl: loadDemoUrl(options.demoUrl, {
      hosted: options.hosted,
      warn: options.warn,
    }),
    platformOrigin: options.platformOrigin,
  })
}
