import type { FeedEntry } from '@/lib/feeds/contracts'
import type { SearchHit } from '@/lib/search/contracts'
import type { ExpertDirectoryEntry } from '@/lib/expert-validation/types'
import {
  MAX_ASSISTANT_CONTEXT_TEXT,
  normalizeAssistantContexts,
  type AssistantContextSnapshot,
} from '@/lib/analyst/context-snapshot'

function buildSnapshot(
  value: Omit<AssistantContextSnapshot, 'version' | 'capturedAt'>,
  capturedAt = new Date(),
): AssistantContextSnapshot {
  const cleanSingleLine = (input: string, max: number) => input
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
  const title = cleanSingleLine(value.title, 200) || '—'
  const text = value.text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, MAX_ASSISTANT_CONTEXT_TEXT)
    .trim() || title
  const sourceLabel = value.sourceLabel ? cleanSingleLine(value.sourceLabel, 120) : ''
  let sourceUrl: string | undefined
  if (value.sourceUrl) {
    try {
      const parsed = new URL(value.sourceUrl)
      if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) sourceUrl = parsed.toString()
    } catch {
      sourceUrl = undefined
    }
  }
  return normalizeAssistantContexts([{
    version: 1,
    id: cleanSingleLine(value.id, 160) || `${value.kind}:unknown`,
    kind: value.kind,
    title,
    text,
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    capturedAt: capturedAt.toISOString(),
  }])[0]
}

function lines(values: readonly (string | null | undefined | false)[]): string {
  return values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).join('\n')
}

export function snapshotSearchHit(hit: SearchHit, capturedAt?: Date): AssistantContextSnapshot {
  const identifiers = hit.identifiers
    ? Object.entries(hit.identifiers).map(([key, value]) => `${key.toUpperCase()}: ${value}`).join(' · ')
    : null
  return buildSnapshot({
    id: hit.id,
    kind: 'search_result',
    title: hit.title,
    text: lines([hit.snippet, identifiers]) || `Search result: ${hit.title}`,
    sourceLabel: hit.sources.map(source => source.label).join(', ').slice(0, 120) || 'Search',
    ...(hit.url ? { sourceUrl: hit.url } : {}),
  }, capturedAt)
}

export function snapshotFeedEntry(entry: FeedEntry, capturedAt?: Date): AssistantContextSnapshot {
  return buildSnapshot({
    id: String(entry.externalId),
    kind: 'feed_article',
    title: entry.title,
    text: lines([
      entry.author ? `Author: ${entry.author}` : null,
      entry.publishedAt ? `Published: ${entry.publishedAt}` : null,
      entry.contentText || entry.summary,
    ]) || `Feed article: ${entry.title}`,
    sourceLabel: entry.source.title,
    ...(entry.url ? { sourceUrl: entry.url } : {}),
  }, capturedAt)
}

export function snapshotExpert(expert: ExpertDirectoryEntry, capturedAt?: Date): AssistantContextSnapshot {
  return buildSnapshot({
    id: expert.id,
    kind: 'expert',
    title: expert.name,
    text: lines([
      expert.title ? `Title: ${expert.title}` : null,
      expert.organization ? `Organization: ${expert.organization}` : null,
      expert.profileText,
      `Verification: ${expert.verificationType}`,
    ]),
    sourceLabel: expert.scope === 'global' ? 'Platform expert' : 'Fund expert',
  }, capturedAt)
}

export interface CompanySnapshotInput {
  readonly id: string
  readonly name: string
  readonly stage: string | null
  readonly status: string
  readonly tags: readonly string[]
  readonly industry: readonly string[] | null
  readonly portfolioGroup: readonly string[] | null
  readonly lastReportAt: string | null
  readonly firstInvestmentDate: string | null
}

export function snapshotCompany(company: CompanySnapshotInput, capturedAt?: Date): AssistantContextSnapshot {
  return buildSnapshot({
    id: company.id,
    kind: 'company',
    title: company.name,
    text: lines([
      `Status: ${company.status}`,
      company.stage ? `Stage: ${company.stage}` : null,
      company.industry?.length ? `Industry: ${company.industry.join(', ')}` : null,
      company.tags.length ? `Tags: ${company.tags.join(', ')}` : null,
      company.portfolioGroup?.length ? `Portfolio group: ${company.portfolioGroup.join(', ')}` : null,
      company.firstInvestmentDate ? `First investment: ${company.firstInvestmentDate}` : null,
      company.lastReportAt ? `Last report: ${company.lastReportAt}` : null,
    ]),
    sourceLabel: 'Portfolio company',
  }, capturedAt)
}

export interface DealSnapshotInput {
  readonly id: string
  readonly company_name: string | null
  readonly founder_name: string | null
  readonly founder_email: string | null
  readonly intro_source: string | null
  readonly referrer_name: string | null
  readonly thesis_fit_score: string | null
  readonly stage: string | null
  readonly industry: string | null
  readonly raise_amount: string | null
  readonly status: string
  readonly created_at: string
}

export function snapshotDeal(deal: DealSnapshotInput, capturedAt?: Date): AssistantContextSnapshot {
  return buildSnapshot({
    id: deal.id,
    kind: 'deal',
    title: deal.company_name || '—',
    text: lines([
      deal.founder_name ? `Founder: ${deal.founder_name}` : null,
      deal.founder_email ? `Founder email: ${deal.founder_email}` : null,
      deal.stage ? `Stage: ${deal.stage}` : null,
      deal.industry ? `Industry: ${deal.industry}` : null,
      deal.raise_amount ? `Raise: ${deal.raise_amount}` : null,
      deal.intro_source ? `Source: ${deal.intro_source}` : null,
      deal.referrer_name ? `Referrer: ${deal.referrer_name}` : null,
      deal.thesis_fit_score ? `Thesis fit: ${deal.thesis_fit_score}` : null,
      `Status: ${deal.status}`,
      `Created: ${deal.created_at}`,
    ]),
    sourceLabel: 'Deal',
  }, capturedAt)
}

/** Board cards expose a deliberately smaller projection than the table. Keep the AI snapshot at
 * the same disclosure level: no founder email, referrer, industry, or raise amount. */
export function snapshotDealBoard(deal: DealSnapshotInput, capturedAt?: Date): AssistantContextSnapshot {
  return buildSnapshot({
    id: deal.id,
    kind: 'deal',
    title: deal.company_name || '—',
    text: lines([
      deal.founder_name ? `Founder: ${deal.founder_name}` : null,
      deal.stage ? `Stage: ${deal.stage}` : null,
      deal.intro_source ? `Source: ${deal.intro_source}` : null,
      deal.thesis_fit_score ? `Thesis fit: ${deal.thesis_fit_score}` : null,
      `Status: ${deal.status}`,
      `Created: ${deal.created_at}`,
    ]),
    sourceLabel: 'Deal',
  }, capturedAt)
}
