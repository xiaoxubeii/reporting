import type { Database, IntroSource } from '@/lib/types/database'
import {
  DealResearchQueueError,
  queueDealResearch,
} from '@/lib/deals/research-queue'

type InboundDealInsert = Database['public']['Tables']['inbound_deals']['Insert']

interface ProcessedDealResult {
  readonly dealId?: string | null
}

interface PersistedDeal {
  readonly id: string
}

export interface EnsuredDeal {
  readonly dealId: string
  readonly usedFallback: boolean
}

interface PublicSubmissionFallbackInput {
  readonly emailId: string
  readonly fundId: string
  readonly companyName: string
  readonly companyUrl: string
  readonly founderName: string
  readonly founderEmail: string
  readonly pitch: string
  readonly introSource?: IntroSource | null
  readonly referrerName?: string | null
  readonly referrerEmail?: string | null
}

export function buildPublicSubmissionFallbackDeal(
  input: PublicSubmissionFallbackInput,
): InboundDealInsert {
  return {
    email_id: input.emailId,
    fund_id: input.fundId,
    company_name: input.companyName,
    company_url: input.companyUrl || null,
    company_domain: companyDomain(input.companyUrl),
    founder_name: input.founderName,
    founder_email: input.founderEmail,
    co_founders: [],
    intro_source: input.introSource ?? null,
    referrer_name: input.referrerName ?? null,
    referrer_email: input.referrerEmail ?? null,
    stage: null,
    industry: null,
    raise_amount: null,
    company_summary: input.pitch,
    thesis_fit_analysis: null,
    thesis_fit_score: null,
    status: 'new',
    research_status: 'skipped',
    prior_deal_id: null,
  }
}

/**
 * A completed analyzer call is not proof that a Deal was persisted. Treat an
 * absent Deal id as a failed analysis outcome and require the deterministic,
 * idempotent fallback row before any intake route reports success.
 */
export async function ensureProcessedDeal(
  result: ProcessedDealResult | null | undefined,
  insertFallback: () => Promise<PersistedDeal | null>,
): Promise<EnsuredDeal> {
  if (result?.dealId) {
    return { dealId: result.dealId, usedFallback: false }
  }

  const fallbackDeal = await insertFallback()
  if (!fallbackDeal) throw new Error('Fallback Deal insert failed')

  return { dealId: fallbackDeal.id, usedFallback: true }
}

/**
 * Preserve the normal intake contract when AI screening is unavailable: a
 * durable fallback Deal still enters Research when that Fund has Research
 * enabled. Disabled Research is a valid configuration, while storage failures
 * remain visible to the caller for server-side logging.
 */
export async function queueFallbackDealResearch(
  input: Readonly<{ dealId: string; fundId: string }>,
  queue: typeof queueDealResearch = queueDealResearch,
): Promise<{ queued: boolean }> {
  try {
    await queue({ ...input, actor: { type: 'system' } })
    return { queued: true }
  } catch (error) {
    if (error instanceof DealResearchQueueError && error.code === 'disabled') {
      return { queued: false }
    }
    throw error
  }
}

function companyDomain(companyUrl: string): string | null {
  if (!companyUrl) return null
  const hostname = new URL(companyUrl).hostname.toLowerCase()
  return hostname.replace(/^www\./, '') || null
}
