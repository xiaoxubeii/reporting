export const EXPERT_REQUEST_STATUSES = ['draft', 'invited', 'submitted'] as const
export type ExpertRequestStatus = typeof EXPERT_REQUEST_STATUSES[number]

export const EXPERT_SOURCE_KINDS = ['research_gap', 'contradiction'] as const
export type ExpertSourceKind = typeof EXPERT_SOURCE_KINDS[number]

export type ExpertSelectionMethod = 'manual' | 'auto_match'
export type ExpertScope = 'global' | 'fund'
export type ExpertStatus = 'active' | 'inactive'
export type ExpertVerificationType = 'platform_certified' | 'fund_confirmed'
export type ExpertSourceType = 'platform' | 'manual' | 'discovery'

export interface ExpertSourceRef {
  draftId: string
  researchJobId?: string
  kind: ExpertSourceKind
  index: number
  snapshot: Record<string, unknown>
}

export interface ExpertDirectoryEntry {
  id: string
  scope: ExpertScope
  name: string
  title: string | null
  organization: string | null
  profileText: string
  status: ExpertStatus
  hasEmbedding: boolean
  verificationType: ExpertVerificationType
  sourceType: ExpertSourceType
  verifiedAt: string | null
}

export interface ExpertMatch extends ExpertDirectoryEntry {
  similarity: number
}

export interface ExpertIdentitySnapshot {
  name: string
  title: string | null
  organization: string | null
  profileText: string
  verificationType: ExpertVerificationType
  sourceType: ExpertSourceType
  verifiedAt: string | null
}

export interface ExpertValidationRequest {
  id: string
  fundId: string
  dealId: string
  sourceKind: ExpertSourceKind
  sourceRef: ExpertSourceRef
  question: string
  expertProfile: string
  contextSnapshot: string
  expertId: string | null
  selectionMethod: ExpertSelectionMethod | null
  expertSnapshot: ExpertIdentitySnapshot | null
  status: ExpertRequestStatus
  invitedAt: string | null
  expiresAt: string | null
  emailProviderAcceptedAt: string | null
  emailErrorMessage: string | null
  submittedAt: string | null
  documentId: string | null
  evidenceStatus: string | null
  materializationError: string | null
  createdAt: string
  updatedAt: string
}

export interface GeneratedValidationInputs {
  question: string
  expertProfile: string
  contextSnapshot: string
}

export interface PublicExpertInvitation {
  invitationParty: string
  deadline: string
  question: string
  contextSnapshot: string
  responseInstructions: string
  submittedAt: string | null
}

export const EXPERT_LIMITS = {
  question: 4_000,
  expertProfile: 6_000,
  contextSnapshot: 12_000,
  response: 50_000,
  expertName: 160,
  expertEmail: 320,
  expertTitle: 200,
  expertOrganization: 240,
  profileText: 6_000,
} as const
