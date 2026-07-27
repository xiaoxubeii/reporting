import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('Fund invitation authentication handoff', () => {
  it('admits signup only for a live exact-email invitation or existing whitelist rule', () => {
    const route = source('app/api/auth/signup/route.ts')
    expect(route).toContain("from('fund_member_invitations')")
    expect(route).toContain("eq('email_normalized', normalizedEmail)")
    expect(route).toContain("not('delivery_confirmed_at', 'is', null)")
    expect(route).toContain("is('accepted_at', null)")
    expect(route).toContain("is('revoked_at', null)")
    expect(route).toContain("is('replaced_at', null)")
    expect(route).toContain("gt('expires_at'")
    expect(route).toContain("eq('fund_id', tenant.id)")
    expect(route).toContain('!allowed && !invitation')
  })

  it('preserves the safe same-origin invitation destination through login and signup', () => {
    const auth = source('app/auth/page.tsx')
    const signup = source('app/auth/signup/page.tsx')
    const magic = source('app/auth/magic-link/page.tsx')
    for (const page of [auth, signup, magic]) {
      expect(page).toContain('safeNextPath')
      expect(page).toContain("searchParams.get('next')")
    }
    expect(auth).toContain('`/auth/signup${nextQuery}`')
    expect(auth).toContain('`/auth/magic-link${nextQuery}`')
    expect(signup).toContain('next=${encodeURIComponent(destination)}')
    expect(magic).toContain('next=${encodeURIComponent(destination)}')
  })

  it('keeps acceptance retries idempotent and provisions the accepted user feed account', () => {
    const route = source('app/api/fund-invitations/accept/route.ts')
    const service = source('lib/identity/invitations.ts')
    expect(route).toContain('resolveFundInvitationAcceptanceContext')
    expect(route).not.toContain('resolveFundInvitation(admin, rawToken)')
    expect(service).toContain("rpc('accept_fund_member_invitation'")
    expect(service).toContain('automaticMinifluxProvisioningEnabled()')
    expect(service).toContain('ensureMinifluxConnection(admin, params.userId)')
  })

  it('keeps the trusted localhost listener port in the accepted Fund destination', () => {
    const route = source('app/api/fund-invitations/accept/route.ts')
    expect(route).toContain('fundWorkspaceEnvironmentForRequest')
    expect(route).toContain('fundWorkspaceEnvironmentForRequest(req)')
    expect(route).toContain('canonicalFundOriginForId(')
  })
})
