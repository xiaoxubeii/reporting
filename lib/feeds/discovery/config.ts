export const SEMANTIC_VERSION = 'semantic-v1'
export const DEAL_CLASSIFIER_VERSION = 'deal-signal-v1'
export const TRENDING_STRATEGY_VERSION = 'trending-v1'
export const DEAL_SIGNAL_STRATEGY_VERSION = 'deal-signal-gate-v1'

export type DiscoveryAIProviderType = 'anthropic' | 'openai' | 'gemini' | 'openrouter'

export interface DiscoveryVersions {
  readonly semantic: string
  readonly classifier: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONFIGURATION_ERROR = 'Feed discovery AI configuration is unavailable'

export function validateDiscoveryFundId(fundId: unknown): string {
  if (typeof fundId !== 'string' || !UUID_PATTERN.test(fundId)) throw new Error(CONFIGURATION_ERROR)
  return fundId
}

export function createDiscoveryVersions(configurationFingerprint: string): DiscoveryVersions {
  if (!/^[0-9a-f]{64}$/.test(configurationFingerprint)) throw new Error(CONFIGURATION_ERROR)
  const suffix = configurationFingerprint.slice(0, 24)
  return Object.freeze({
    semantic: `${SEMANTIC_VERSION}-${suffix}`,
    classifier: `${DEAL_CLASSIFIER_VERSION}-${suffix}`,
  })
}
