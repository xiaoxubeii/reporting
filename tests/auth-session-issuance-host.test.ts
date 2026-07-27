import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('client-issued authentication sessions re-enter the Host/Fund boundary', () => {
  it('routes both password-recovery session issuers through post-login validation', () => {
    const forgotPassword = source('app/auth/forgot-password/page.tsx')
    const auth = source('app/auth/page.tsx')

    expect(forgotPassword).toContain('/auth/post-login?method=recovery&next=')
    expect(auth).toContain('/auth/post-login?method=code&next=')
    expect(forgotPassword).not.toContain("router.push('/auth/reset-password')")
    expect(auth).not.toContain('router.replace(destination)')
  })

  it('clears an LP session locally when activation reveals the wrong Host Fund', () => {
    const welcome = source('app/portal/welcome/page.tsx')

    expect(welcome).toContain("res.status !== 404")
    expect(welcome).toContain("signOut({ scope: 'local' })")
    expect(welcome).toContain('/auth?error=workspace_mismatch')
  })
})
