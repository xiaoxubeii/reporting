export const CONNECTED_SURFACES = [
  'signals',
  'feeds',
  'search',
  'deals',
  'companies',
  'research',
  'experts',
  'evidence',
  'tracking',
  'decisions',
  'portfolio',
  'reports',
  'lpPortal',
  'fundOps',
  'notes',
  'sources',
  'thesis',
  'audit',
  'team',
  'knowledge',
] as const

export const DISCOVER_CARDS = ['signals', 'dealIntelligence', 'sourceNetwork'] as const
export const RESEARCH_CARDS = ['aiResearch', 'expertValidation'] as const
export const ACT_CARDS = ['decisionTrail', 'portfolioContinuity'] as const

export type ConnectedSurface = (typeof CONNECTED_SURFACES)[number]
export type DiscoverCard = (typeof DISCOVER_CARDS)[number]
export type ResearchCard = (typeof RESEARCH_CARDS)[number]
export type ActCard = (typeof ACT_CARDS)[number]
