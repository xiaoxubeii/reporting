import type { ManualDealPrefill } from '@/components/deals/manual-deal-dialog'
import { MAX_NAME_LEN, MAX_PITCH_LEN, safeWebUrl } from '@/lib/deals/submission-validation'

interface ArticlePrefillInput {
  readonly key: string
  readonly title: string
  readonly url?: string | null
  readonly summary?: string | null
  readonly contentText?: string | null
  readonly companyName?: string | null
  readonly companyDomain?: string | null
  readonly evidence?: readonly string[]
}

export function buildArticleDealPrefill(input: ArticlePrefillInput): ManualDealPrefill {
  const safeSourceUrl = input.url ? safeWebUrl(input.url) : null
  const safeCompanyUrl = input.companyDomain ? safeWebUrl(input.companyDomain) : null
  const sections = [
    input.title.trim() ? `Source title: ${input.title.trim()}` : null,
    safeSourceUrl ? `Source link: ${safeSourceUrl}` : null,
    input.summary?.trim() ? `Summary: ${input.summary.trim()}` : null,
    input.evidence?.length ? `Evidence:\n${input.evidence.map(item => `- ${item.trim()}`).join('\n')}` : null,
    input.contentText?.trim() ? `Article text:\n${input.contentText.trim()}` : null,
  ].filter((value): value is string => Boolean(value))
  return Object.freeze({
    key: input.key,
    companyName: input.companyName?.trim().slice(0, MAX_NAME_LEN) ?? '',
    companyUrl: safeCompanyUrl,
    pitch: sections.join('\n\n').slice(0, MAX_PITCH_LEN),
  })
}
