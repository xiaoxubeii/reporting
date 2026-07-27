export interface RecommendationParagraph {
  section_id: string
  prose: string
  origin: string
}

const PARTNER_PLACEHOLDER = '[Partner to complete]'

/** Return the partner-authored recommendation that makes a memo finalizable. */
export function findPartnerRecommendation(
  paragraphs: readonly RecommendationParagraph[],
): RecommendationParagraph | undefined {
  return paragraphs.find(paragraph =>
    paragraph.section_id === 'recommendation'
    && paragraph.origin !== 'partner_only_placeholder'
    && paragraph.prose.trim() !== ''
    && paragraph.prose.trim() !== PARTNER_PLACEHOLDER,
  )
}
