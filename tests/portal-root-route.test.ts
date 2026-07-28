import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('LP Portal root route', () => {
  it('redirects the public-site LP Portal target to the active LP overview', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/portal/page.tsx'), 'utf8')
    expect(source).toContain("redirect('/portal/overview')")
  })
})
