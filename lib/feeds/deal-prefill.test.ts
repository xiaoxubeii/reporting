import { describe, expect, it } from 'vitest'
import { MAX_PITCH_LEN } from '@/lib/deals/submission-validation'
import { buildArticleDealPrefill } from './deal-prefill'

describe('buildArticleDealPrefill', () => {
  it('includes bounded plain-text article context and a safe source URL', () => {
    const prefill = buildArticleDealPrefill({
      key: 'entry-1', title: 'Acme update', url: 'https://news.example/acme',
      summary: 'Acme is raising.', contentText: 'Long article body.',
    })
    expect(prefill.pitch).toContain('Source title: Acme update')
    expect(prefill.pitch).toContain('Source link: https://news.example/acme')
    expect(prefill.pitch).toContain('Article text:\nLong article body.')
  })

  it('drops unsafe URLs and caps untrusted text to the existing manual API boundary', () => {
    const prefill = buildArticleDealPrefill({
      key: 'entry-2', title: 'Unsafe', url: 'javascript:alert(1)', contentText: 'x'.repeat(MAX_PITCH_LEN + 500),
      companyDomain: 'javascript:alert(1)',
    })
    expect(prefill.pitch).not.toContain('javascript:')
    expect(prefill.pitch).toHaveLength(MAX_PITCH_LEN)
    expect(prefill.companyUrl).toBeNull()
  })
})
