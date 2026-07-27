import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('global Assistant inventory', () => {
  it('mounts one shell-level host and only that host renders the panel', () => {
    const shell = fs.readFileSync(path.join(process.cwd(), 'components/app-shell.tsx'), 'utf8')
    const host = fs.readFileSync(path.join(process.cwd(), 'components/analyst-floating-host.tsx'), 'utf8')

    expect(shell.match(/<AnalystFloatingHost>/g)).toHaveLength(1)
    expect(shell.match(/<\/AnalystFloatingHost>/g)).toHaveLength(1)
    expect(host.match(/<AnalystPanel\s*\/>/g)).toHaveLength(1)

    const localConsumers = sourceFiles(path.join(process.cwd(), 'app'))
      .filter(file => fs.readFileSync(file, 'utf8').includes('<AnalystPanel'))
    expect(localConsumers).toEqual([])
  })

  it('keeps the dock contract in shared shell components instead of page-specific padding', () => {
    const shell = fs.readFileSync(path.join(process.cwd(), 'components/app-shell.tsx'), 'utf8')
    const host = fs.readFileSync(path.join(process.cwd(), 'components/analyst-floating-host.tsx'), 'utf8')
    const panel = fs.readFileSync(path.join(process.cwd(), 'components/analyst-panel.tsx'), 'utf8')
    const drawer = fs.readFileSync(path.join(process.cwd(), 'components/mobile-drawer-panel.tsx'), 'utf8')

    expect(host).toContain('xl:max-w-[1680px]')
    expect(host).toContain('data-testid="assistant-edge-launcher"')
    expect(host).toContain('data-testid="assistant-edge-drop-zone"')
    expect(panel).toContain('desktopMode="docked"')
    expect(drawer).toContain("'(min-width: 1280px)'")
    expect(drawer).toContain('w-[400px]')
    expect(drawer).toContain('max-w-[calc(100vw-1rem)]')

    for (const file of sourceFiles(path.join(process.cwd(), 'app'))) {
      expect(fs.readFileSync(file, 'utf8')).not.toContain('xl:pr-[400px]')
    }
    expect(shell).not.toContain('xl:pr-[400px]')
  })

  it('keeps trusted page-scope synchronizers independent from launchers', () => {
    const companyPage = fs.readFileSync(path.join(process.cwd(), 'app/(app)/companies/[id]/page.tsx'), 'utf8')
    const dealDetail = fs.readFileSync(path.join(process.cwd(), 'app/(app)/deals/[id]/deal-detail.tsx'), 'utf8')
    const scopeComponents = fs.readFileSync(path.join(process.cwd(), 'components/analyst-scope.tsx'), 'utf8')

    expect(companyPage).toContain('<AnalystCompanyScope companyId={company.id} />')
    expect(dealDetail).toContain('setDealId(deal.id)')
    expect(scopeComponents).toContain('setVehicle(group)')
    expect(scopeComponents).toContain('setDomain(domain)')
  })

  it('treats the existing OpenAI-compatible provider as a configured assistant provider', () => {
    const appLayout = fs.readFileSync(path.join(process.cwd(), 'app/(app)/layout.tsx'), 'utf8')
    const layoutCache = fs.readFileSync(path.join(process.cwd(), 'lib/cache/layout.ts'), 'utf8')

    expect(layoutCache).toContain('openrouter_api_key_encrypted')
    expect(appLayout).toContain("fundSettings?.openrouter_api_key_encrypted ? 'openrouter' : null")
  })

  it('uses the shared compact assistant action on every repeated content surface', () => {
    const surfaces = [
      ['components/feeds/today-feed.tsx', 1],
      ['components/search/search-page.tsx', 1],
      ['components/experts/expert-directory.tsx', 1],
      ['app/(app)/dashboard/dashboard-companies.tsx', 1],
      ['app/(app)/deals/deals-content.tsx', 2],
    ] as const

    for (const [relativePath, expectedActions] of surfaces) {
      const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
      expect(source.match(/<AnalystContextActions\b/g)).toHaveLength(expectedActions)
      expect(source.match(/<AnalystContextActions\b[^>]*presentation="compact-hover"[^>]*\/>/g)).toHaveLength(expectedActions)
    }

    expect(fs.readFileSync(path.join(process.cwd(), 'components/search/search-page.tsx'), 'utf8'))
      .toContain('<article key={hit.id} className="group py-5">')
    expect(fs.readFileSync(path.join(process.cwd(), 'components/experts/expert-directory.tsx'), 'utf8'))
      .toContain('<article className="group rounded-lg border p-4">')
    expect(fs.readFileSync(path.join(process.cwd(), 'app/(app)/dashboard/dashboard-companies.tsx'), 'utf8'))
      .toContain('<article key={c.id} className="group relative rounded-lg border bg-card transition-colors hover:bg-accent/50">')

    const deals = fs.readFileSync(path.join(process.cwd(), 'app/(app)/deals/deals-content.tsx'), 'utf8')
    expect(deals).toContain('<tr key={d.id} className="group border-t hover:bg-muted/30">')
    expect(deals).toContain('className={`group rounded border bg-background p-2 cursor-grab')
  })
})

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(child)
    return entry.name.endsWith('.tsx') ? [child] : []
  })
}
