// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DiligenceIndex } from '../app/(app)/diligence/diligence-index'
import englishMessages from '../messages/en.json'
import chineseMessages from '../messages/zh-CN.json'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('../components/feature-visibility-context', () => ({
  useFeatureVisibility: () => ({ diligence: 'enabled' }),
}))
vi.mock('../components/analyst-button', () => ({ AnalystToggleButton: () => null }))
vi.mock('../components/analyst-panel', () => ({ AnalystPanel: () => null }))
vi.mock('../components/analyst-scope', () => ({ AnalystDomainScope: () => null }))

const deal = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Localized Stage Deal',
  sector: 'Clinical AI',
  stage_at_consideration: 'Series A',
  deal_status: 'active' as const,
  current_memo_stage: 'not_started' as const,
  output_language: 'en' as const,
  lead_partner_id: null,
  promoted_company_id: null,
  created_at: '2026-07-26T00:00:00.000Z',
  updated_at: '2026-07-26T00:00:00.000Z',
}

beforeEach(() => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ counts: { open: 0, must_address: 0 } }),
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('diligence index localization', () => {
  it.each([
    ['en' as const, englishMessages, 'Stage: Not started', 'Not started'],
    ['zh-CN' as const, chineseMessages, '阶段：尚未开始', '尚未开始'],
  ])('renders the complete %s stage label without leaking its message key', (
    locale,
    messages,
    expectedLabel,
    expectedStage,
  ) => {
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        now={new Date('2026-07-26T00:00:00.000Z')}
        timeZone="UTC"
      >
        <DiligenceIndex initialDeals={[deal]} isAdmin={false} />
      </NextIntlClientProvider>,
    )

    const card = screen.getByRole('link', { name: /Localized Stage Deal/ })
    expect(card.textContent).toContain(expectedLabel)
    expect(card.textContent).not.toContain('Diligence.index.stageLabel')
    expect(
      Array.from(card.querySelectorAll('span.font-medium')).some(
        element => element.textContent === expectedStage,
      ),
    ).toBe(true)
  })
})
