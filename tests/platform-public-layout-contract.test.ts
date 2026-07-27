import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('platform public layout contract', () => {
  it('classifies the trusted request Host on the server', () => {
    const layout = source('app/(public)/layout.tsx')

    expect(layout).not.toContain("'use client'")
    expect(layout).toContain("headers()")
    expect(layout).toContain('classifyFundHost')
    expect(layout).toContain('<PublicLayoutClient')
  })

  it('waits for the auth check before rendering the platform root', () => {
    const client = source('app/(public)/public-layout-client.tsx')

    expect(client).toContain('startLegacyPublicAuthCheck({')
    expect(client).toContain('surface,')
    expect(client.indexOf('if (!authChecked) return null')).toBeLessThan(
      client.indexOf("if (surface === 'platform-landing') return <>{children}</>"),
    )
    expect(client).toContain('<PublicShell>{children}</PublicShell>')
  })

  it('selects the new landing only for a classified platform homepage', () => {
    const page = source('app/(public)/page.tsx')

    expect(page).toContain("hostContext.mode === 'platform'")
    expect(page).toContain('<PlatformLanding config={platformConfig} />')
    expect(page.indexOf("hostContext.mode === 'platform'")).toBeLessThan(
      page.indexOf("getTranslations('PublicHome')"),
    )
  })
})
