// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DealResearchCard } from './research-card'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => 'formatted date' }),
}))

afterEach(cleanup)

const baseProps = {
  dealId: 'deal-1',
  summary: null,
  findings: null,
  sources: null,
  error: null,
  researchedAt: null,
  onQueued: vi.fn(),
}

describe('DealResearchCard retry action', () => {
  it.each(['done', 'failed'] as const)('labels a terminal %s result as a rerun', status => {
    render(<DealResearchCard {...baseProps} status={status} />)

    expect(screen.getByRole('button', { name: 'rerun' })).toBeDefined()
  })

  it.each([null, 'skipped'] as const)('labels an unstarted %s result as an initial run', status => {
    render(<DealResearchCard {...baseProps} status={status} />)

    expect(screen.getByRole('button', { name: 'run' })).toBeDefined()
  })
})
