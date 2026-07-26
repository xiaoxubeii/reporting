import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

describe('Fund email deployment documentation', () => {
  it('documents isolated platform and Fund Resend configuration', () => {
    const docs = source('docs/fund-email-resend.md')
    for (const term of [
      'RESEND_API_KEY',
      'SYSTEM_EMAIL_FROM',
      'FUND_EMAIL_BASE_DOMAIN',
      'FUND_EMAIL_WEBHOOK_BASE_URL',
      'http_status:404',
      'ingress validate',
      'systemctl enable --now cloudflared',
      'NoNewPrivileges=true',
      'Supabase Auth',
      'distinct',
      'SPF',
      'DKIM',
      'MX',
      'DMARC',
      'email.received',
      'sending_access',
      'full-access receiving API key',
      'becomes verified only after Resend accepts that real send',
      'rollback',
      '3,000',
      '100',
    ]) expect(docs).toContain(term)
    expect(docs).toMatch(/sending API key[\s\S]*receiving API key/i)
  })

  it('declares the server-only platform environment variables', () => {
    const env = source('.env.example')
    expect(env).toMatch(/FUND_EMAIL_BASE_DOMAIN=/)
    expect(env).toMatch(/FUND_EMAIL_WEBHOOK_BASE_URL=/)
    expect(env).toMatch(/SYSTEM_EMAIL_FROM=/)
    expect(env).not.toMatch(/NEXT_PUBLIC_(?:RESEND|FUND_EMAIL|SYSTEM_EMAIL)/)
  })
})
