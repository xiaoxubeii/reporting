import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const detailSource = readFileSync(
  path.join(process.cwd(), 'app/(app)/diligence/[id]/deal-detail.tsx'),
  'utf8',
)

describe('diligence detail navigation order', () => {
  it('aligns the first navigation tabs with the Data Room to Checklist stage flow', () => {
    expect(detailSource).toContain(
      "const TABS = ['Data Room', 'Checklist', 'Research', 'Expert Validation', 'Scoring', 'Memo', 'Settings'] as const",
    )
  })

  it('keeps Checklist as the default active tab', () => {
    expect(detailSource).toContain("useState<Tab>('Checklist')")
  })
})
