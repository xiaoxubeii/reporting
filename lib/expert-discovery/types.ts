export const EXPERT_DISCOVERY_SOURCE_IDS = ['pubmed', 'clinical_trials'] as const
export type ExpertDiscoverySourceId = typeof EXPERT_DISCOVERY_SOURCE_IDS[number]
export type ExpertCandidateStatus = 'pending' | 'confirmed' | 'rejected'

export interface ExpertSourceEvidence {
  sourceId: ExpertDiscoverySourceId
  recordId: string
  recordTitle: string
  url: string
  role: string | null
}

export interface DiscoveredExpert {
  identityFingerprint: string
  name: string
  email: string | null
  title: string | null
  organization: string | null
  profileText: string
  evidence: readonly ExpertSourceEvidence[]
}

export interface ExpertCandidate {
  id: string
  name: string
  email: string | null
  title: string | null
  organization: string | null
  profileText: string
  status: ExpertCandidateStatus
  discoveryQuery: string
  evidence: readonly ExpertSourceEvidence[]
  confirmedExpertId: string | null
  createdAt: string
  updatedAt: string
}

export interface DiscoverySourceOutcome {
  sourceId: ExpertDiscoverySourceId
  status: 'ok' | 'error'
  resultCount: number
}

export interface ExpertDiscoveryAdapter {
  readonly sourceId: ExpertDiscoverySourceId
  discover(request: Readonly<{ query: string; signal: AbortSignal }>): Promise<readonly DiscoveredExpert[]>
}
