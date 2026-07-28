import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Diligence Affinity authorization', () => {
  it('requires live diligence and relationships access for link management', () => {
    const route = source('app/api/diligence/[id]/affinity/route.ts')
    expect(route).toContain("ensureDeal(params.id, 'read', true)")
    expect(route).toContain("ensureDeal(params.id, 'write', true)")
    expect(route).toContain("hasAccess(access, 'relationships', 'read', 'interactions')")
    expect(route).toContain("hasAccess(access, 'relationships', 'read', 'notes')")
  })

  it('requires diligence write plus both relationship features before importing shared evidence', () => {
    const route = source('app/api/diligence/[id]/documents/from-affinity/route.ts')
    expect(route).toContain("hasAccess(access, 'diligence', 'write')")
    expect(route).toContain("hasAccess(access, 'relationships', 'read', 'interactions')")
    expect(route).toContain("hasAccess(access, 'relationships', 'read', 'notes')")
  })

  it('uses actual-stream byte limits on every JSON Q&A mutation route', () => {
    for (const path of [
      'app/api/diligence/[id]/agent/qa/respond/route.ts',
      'app/api/diligence/[id]/agent/qa/add-question/route.ts',
      'app/api/diligence/[id]/agent/qa/entry/route.ts',
    ]) {
      expect(source(path), path).toMatch(/readBounded(?:PartnerQAJson|JsonRequest)/)
    }
  })
})
