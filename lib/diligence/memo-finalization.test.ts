import { describe, expect, it } from 'vitest'

import { findPartnerRecommendation } from './memo-finalization'

describe('findPartnerRecommendation', () => {
  it('accepts a partner-authored recommendation after the shipped placeholder', () => {
    const recommendation = findPartnerRecommendation([
      {
        section_id: 'recommendation',
        prose: '[Partner to complete]',
        origin: 'partner_only_placeholder',
      },
      {
        section_id: 'recommendation',
        prose: 'Pass. The evidence is insufficient for an investment decision.',
        origin: 'partner_drafted',
      },
    ])

    expect(recommendation?.prose).toBe('Pass. The evidence is insufficient for an investment decision.')
  })

  it('rejects placeholders and blank recommendation paragraphs', () => {
    expect(findPartnerRecommendation([
      {
        section_id: 'recommendation',
        prose: '[Partner to complete]',
        origin: 'partner_only_placeholder',
      },
      {
        section_id: 'recommendation',
        prose: '   ',
        origin: 'partner_drafted',
      },
    ])).toBeUndefined()
  })

  it('ignores prose from other memo sections', () => {
    expect(findPartnerRecommendation([
      {
        section_id: 'executive_summary',
        prose: 'Pass.',
        origin: 'partner_drafted',
      },
    ])).toBeUndefined()
  })
})
