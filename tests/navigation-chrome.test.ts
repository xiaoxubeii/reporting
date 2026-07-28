import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectFile = (path: string) => resolve(process.cwd(), path)

describe('navigation chrome', () => {
  it('orders the sidebar by workflow while preserving existing child navigation', () => {
    const appSidebar = readFileSync(projectFile('components/app-sidebar.tsx'), 'utf8')
    const orderedHrefs = [
      '/pending-actions',
      '/emails',
      '/feeds',
      '/search',
      '/deals',
      '/diligence',
      '/dashboard',
      '/funds',
      '/lps',
      '/usage',
      '/settings/personal',
    ]

    const positions = orderedHrefs.map(href => appSidebar.indexOf(`href: '${href}'`))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
    expect(appSidebar).not.toContain("href: '/review'")

    expect(appSidebar).toMatch(
      /href: '\/diligence'[\s\S]*?children: \[[\s\S]*?href: '\/diligence\/inbox'[\s\S]*?href: '\/diligence\/analytics'[\s\S]*?href: '\/experts'[\s\S]*?\]/,
    )
    expect(appSidebar).toContain("href: '/funds', labelKey: 'funds'")
    expect(appSidebar).toContain("href: '/lps', labelKey: 'lps'")
  })

  it('uses consistent typography for expanded sidebar utility controls', () => {
    const appSidebar = readFileSync(projectFile('components/app-sidebar.tsx'), 'utf8')

    expect(appSidebar).toContain(
      '<LanguageSwitcher className="h-9 w-full text-xs font-normal text-muted-foreground/60 hover:text-muted-foreground focus:ring-0 focus-visible:ring-2 focus-visible:ring-ring" />',
    )
    expect(appSidebar).toContain(
      '<LanguageSwitcher compact className="h-9 w-full hover:text-muted-foreground focus:ring-0 focus-visible:ring-2 focus-visible:ring-ring" />',
    )
    expect(appSidebar.match(/focus-visible:ring-2/g)).toHaveLength(4)
    const utilityPositions = [
      appSidebar.indexOf('<LanguageSwitcher className="h-9 w-full'),
      appSidebar.indexOf('onClick={cycleTheme}'),
      appSidebar.indexOf('onClick={toggle}'),
    ]
    expect(utilityPositions.every(position => position >= 0)).toBe(true)
    expect(utilityPositions).toEqual([...utilityPositions].sort((left, right) => left - right))
  })

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
