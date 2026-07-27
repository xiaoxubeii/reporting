import { describe, expect, it } from 'vitest'
import { snapshotCompany, snapshotDeal, snapshotDealBoard, snapshotExpert, snapshotFeedEntry, snapshotSearchHit } from './source-snapshots'

const now = new Date('2026-07-26T12:00:00.000Z')

describe('assistant source snapshot serializers', () => {
  it('serializes search/feed/expert sources without hidden fixture fields', () => {
    const searchFixture = {
      id: 'hit-1', primaryOrigin: 'web' as const, origins: ['web'] as ['web'], title: 'Study', url: 'https://example.com/study',
      snippet: 'Visible snippet', sources: [{ id: 'web' as const, label: 'Web' }], hiddenToken: 'SECRET',
    }
    const feedFixture = {
      externalId: 1, upstreamId: 1, feedId: 2, title: 'Article', url: 'https://example.com/article', commentsUrl: null,
      author: 'Author', contentText: 'Visible body', summary: 'Summary', imageUrl: null, publishedAt: null, createdAt: null,
      readingTimeMinutes: 2, isRead: false, isSaved: false,
      source: { externalFeedId: 2, title: 'Journal', siteUrl: null, feedUrl: null, category: null }, privateNotes: 'SECRET',
    }
    const expertFixture = {
      id: 'expert-1', scope: 'global', name: 'Dr Example', title: 'Cardiologist', organization: 'Hospital',
      profileText: 'Visible profile', status: 'active', hasEmbedding: true, verificationType: 'platform_certified',
      sourceType: 'platform', verifiedAt: null, email: 'hidden@example.com',
    } as const
    const search = snapshotSearchHit(searchFixture, now)
    const feed = snapshotFeedEntry(feedFixture, now)
    const expert = snapshotExpert(expertFixture, now)

    expect(JSON.stringify([search, feed, expert])).not.toContain('SECRET')
    expect(JSON.stringify(expert)).not.toContain('hidden@example.com')
  })

  it('serializes company and deal allowlists without financial/internal fixture fields', () => {
    const companyFixture = {
      id: 'company-1', name: 'MedAI', stage: 'Series A', status: 'active', tags: ['AI'], industry: ['Health'],
      portfolioGroup: ['Fund I'], lastReportAt: null, firstInvestmentDate: '2025-01-01', teamNotes: 'SECRET', latestCash: 123,
    }
    const dealFixture = {
      id: 'deal-1', company_name: 'DeviceCo', founder_name: 'Founder', founder_email: 'founder@example.com',
      intro_source: 'referral', referrer_name: null, thesis_fit_score: 'strong', stage: 'Seed', industry: 'Device',
      raise_amount: '$5m', status: 'reviewing', created_at: '2026-07-01T00:00:00.000Z', email_id: 'SECRET', prior_deal_id: 'SECRET',
    }
    const company = snapshotCompany(companyFixture, now)
    const deal = snapshotDeal(dealFixture, now)

    expect(JSON.stringify(company)).not.toContain('SECRET')
    expect(JSON.stringify(company)).not.toContain('123')
    expect(JSON.stringify(deal)).not.toContain('SECRET')
  })

  it('limits Deal Board snapshots to fields visible on the board card', () => {
    const deal = snapshotDealBoard({
      id: 'deal-1', company_name: 'DeviceCo', founder_name: 'Founder', founder_email: 'hidden@example.com',
      intro_source: 'referral', referrer_name: 'Hidden Referrer', thesis_fit_score: 'strong', stage: 'Seed',
      industry: 'Hidden industry', raise_amount: '$5m hidden', status: 'reviewing',
      created_at: '2026-07-01T00:00:00.000Z',
    }, now)

    expect(deal.text).toContain('Founder: Founder')
    expect(deal.text).toContain('Stage: Seed')
    expect(deal.text).toContain('Source: referral')
    expect(deal.text).toContain('Thesis fit: strong')
    expect(deal.text).toContain('Status: reviewing')
    expect(deal.text).not.toContain('hidden@example.com')
    expect(deal.text).not.toContain('Hidden Referrer')
    expect(deal.text).not.toContain('Hidden industry')
    expect(deal.text).not.toContain('$5m hidden')
  })
})
