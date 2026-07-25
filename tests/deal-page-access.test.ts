import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(
  new URL('../app/(app)/deals/[id]/page.tsx', import.meta.url),
  'utf8',
)

describe('Deal page access boundary', () => {
  it('checks live Dealflow read access before the service-role Deal query', () => {
    expect(SOURCE).toMatch(/resolvePageAccess\(user\.id\)/)
    expect(SOURCE).toMatch(/canViewPage\(page, 'dealflow'\)/)
    expect(SOURCE.indexOf("canViewPage(page, 'dealflow')")).toBeLessThan(
      SOURCE.indexOf(".from('inbound_deals')"),
    )
  })
})
