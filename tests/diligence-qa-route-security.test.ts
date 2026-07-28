import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function routeSource(name: 'next-batch' | 'finish'): string {
  return readFileSync(
    resolve(process.cwd(), `app/api/diligence/[id]/agent/qa/${name}/route.ts`),
    'utf8',
  )
}

describe('diligence QA lifecycle route security', () => {
  it.each(['next-batch', 'finish'] as const)('%s enforces live diligence write access', name => {
    const source = routeSource(name)
    expect(source).toContain('loadAccessContext')
    expect(source).toContain("hasAccess(access, 'diligence', 'write')")
    expect(source).toContain(".select('fund_id, role')")
  })

  it('bounds and validates the finish request before invoking the stage', () => {
    const source = routeSource('finish')
    expect(source).toContain('readBoundedQAFinishJson')
    expect(source).toContain('parseQAFinishBody')
    expect(source).not.toContain('req.json()')
  })
})
