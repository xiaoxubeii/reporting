import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const detailSource = readFileSync(
  path.join(process.cwd(), 'app/(app)/diligence/[id]/deal-detail.tsx'),
  'utf8',
)

const memoTab = detailSource.slice(
  detailSource.indexOf('function MemoTab('),
  detailSource.indexOf('\n}', detailSource.indexOf('<MemoConfigPanel dealId={dealId}')) + 2,
)

describe('diligence memo card layout', () => {
  it('keeps the stage action bar and agent configuration outside the unified memo card', () => {
    const stageHeaderIndex = memoTab.indexOf('<StageHeader dealId={dealId} stageKey="memo" />')
    const memoSectionIndex = memoTab.indexOf('<Section')
    const configIndex = memoTab.indexOf('<MemoConfigPanel')

    expect(stageHeaderIndex).toBeGreaterThanOrEqual(0)
    expect(memoSectionIndex).toBeGreaterThan(stageHeaderIndex)
    expect(configIndex).toBeGreaterThan(memoSectionIndex)
  })

  it('renders the heading and every memo body state inside one divided card', () => {
    expect(memoTab).toContain('className="overflow-hidden !space-y-0"')
    expect(memoTab).toContain('className="-mx-5 -mb-5 mt-5 border-t"')
    expect(memoTab.indexOf('{loading ? (')).toBeGreaterThan(memoTab.indexOf('<Section'))
    expect(memoTab.indexOf('<MemoEditor')).toBeLessThan(memoTab.indexOf('</Section>'))
    expect(memoTab).not.toContain('rounded-md border bg-card p-12')
    expect(memoTab).toContain('className="p-8 text-center text-sm text-muted-foreground"')
  })
})
