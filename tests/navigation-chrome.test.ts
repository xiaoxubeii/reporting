import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectFile = (path: string) => resolve(process.cwd(), path)

describe('navigation chrome', () => {
  it('does not place email routing administration under Deals', () => {
    const appSidebar = readFileSync(projectFile('components/app-sidebar.tsx'), 'utf8')

    expect(appSidebar).not.toContain("href: '/settings/email-audit'")
    expect(appSidebar).not.toContain("href: '/settings/routing-accuracy'")
  })

  it('does not surface Support or the branded footer links', () => {
    const appSidebar = readFileSync(projectFile('components/app-sidebar.tsx'), 'utf8')
    const publicLayout = readFileSync(projectFile('app/(public)/public-layout-client.tsx'), 'utf8')

    expect(appSidebar).not.toContain("href: '/support'")
    expect(publicLayout).not.toContain("href: '/support-explainer'")
    expect(existsSync(projectFile('components/app-footer.tsx'))).toBe(false)
  })
})
