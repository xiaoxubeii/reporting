import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('fund identity onboarding UI contracts', () => {
  it('creates a fund from name and immutable slug without the retired join flow', () => {
    const source = read('app/onboarding/onboarding-client.tsx')
    expect(source).toContain("fetch('/api/onboarding/fund'")
    expect(source).toContain('normalizeFundSlugCandidate')
    expect(source).toContain('canonicalOrigin')
    expect(source).not.toContain('/api/onboarding/join')
    expect(source).not.toContain('/api/onboarding/check-domain')
  })

  it('keeps invitation tokens out of query strings and persistent storage', () => {
    const page = read('app/invite/page.tsx')
    const layout = read('app/invite/layout.tsx')
    expect(page).toContain('window.location.hash')
    expect(page).toContain('sessionStorage')
    expect(page).not.toContain('localStorage')
    expect(page).not.toContain("searchParams.get('token')")
    expect(layout).toContain("referrer: 'no-referrer'")
  })

  it('renders the authoritative setup state returned by the server', () => {
    const page = read('app/(app)/funds/setup/page.tsx')
    const setup = read('lib/identity/setup.ts')
    const fundSettings = read('app/(app)/settings/page.tsx')
    expect(page).toContain("fetch('/api/onboarding/setup'")
    expect(page).toContain('step.optional')
    expect(page).not.toContain('localStorage')
    expect(page).toContain('role="progressbar"')
    for (const anchor of ['fund-branding', 'fund-email', 'members']) {
      expect(setup).toContain(`/settings#${anchor}`)
      expect(fundSettings).toContain(`id="${anchor}"`)
    }
  })

  it('separates personal identity from fund administration', () => {
    const personal = read('app/(app)/settings/personal/page.tsx')
    const fund = read('app/(app)/settings/page.tsx')
    expect(personal).toContain("fetch('/api/settings/personal'")
    expect(personal).toContain('externalEmail')
    expect(personal).toContain('internalEmail')
    expect(personal).toContain('htmlFor="external-login-email"')
    expect(personal).toContain('sm:flex-row')
    expect(fund).toContain('SettingsScopeNavigation')
    expect(fund).not.toContain('<ProfileSection displayName=')
    expect(fund).not.toContain('<MfaSection />')
    expect(fund).not.toContain('<DangerZone')
  })

  it('manages exact-email invitations instead of join requests', () => {
    const settings = read('app/(app)/settings/page.tsx')
    expect(settings).toContain('/api/settings/members/invitations')
    expect(settings).not.toContain('pendingRequests')
    expect(settings).not.toContain('handleRequest')
    expect(settings).toContain('isFounder={settings.isFounder}')
    expect(settings).toContain("isFounder && <SelectItem value=\"admin\"")
    expect(settings).toContain('htmlFor="fund-invite-email"')
    expect(settings).toContain('<form className="mt-3 space-y-2"')
    expect(settings).toContain('<TeamSection isAdmin={false}')
    expect(read('components/settings/settings-scope-navigation.tsx')).toContain('available: Boolean(fundName)')
  })

  it('does not send regular members to the administrator setup checklist', () => {
    const invitation = read('app/invite/page.tsx')
    expect(invitation).toMatch(/invitation\?\.role === 'admin'[\s\S]*accepted\.setup/)
  })

  it('uses bounded JSON readers and never returns a decrypted webhook secret', () => {
    for (const file of [
      'app/api/auth/signup/route.ts',
      'app/api/onboarding/fund/route.ts',
      'app/api/settings/personal/route.ts',
      'app/api/settings/members/invitations/route.ts',
      'app/api/public/fund-invitations/resolve/route.ts',
      'app/api/fund-invitations/accept/route.ts',
    ]) {
      expect(read(file), file).toContain('readIdentityJson')
      expect(read(file), file).not.toContain('req.json()')
    }
    const settingsRoute = read('app/api/settings/route.ts')
    expect(settingsRoute).not.toContain('postmarkWebhookToken: webhookToken')
    expect(settingsRoute).not.toContain("decrypt(settings.postmark_webhook_token_encrypted")
    expect(read('lib/identity/http.ts')).toContain('request.body.getReader()')
    expect(read('lib/identity/http.ts')).not.toContain('request.text()')
  })

  it('fails closed when the shared limiter is unavailable for invitation resend', () => {
    expect(read('app/api/settings/members/invitations/[id]/route.ts'))
      .toMatch(/fund-invite-resend[\s\S]*databaseFailure:\s*'deny'/)
  })

  it('rotates a Postmark webhook credential without returning stored secrets on settings GET', () => {
    const page = read('app/(app)/settings/page.tsx')
    const route = read('app/api/settings/postmark-webhook-token/route.ts')
    expect(page).toContain("fetch('/api/settings/postmark-webhook-token', { method: 'POST' })")
    expect(page).toContain("t('webhookTokenOnce')")
    expect(route).toContain('mintPostmarkWebhookCredential')
    expect(route).toContain("databaseFailure: 'deny'")
    expect(route).toContain('postmark_webhook_token: null')
    expect(read('app/api/settings/route.ts')).toContain("postmarkWebhookToken: ''")
  })
})
