import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

describe('platform email boundary', () => {
  it('routes member approval mail through platform Resend only', () => {
    const email = source('lib/email.ts')
    expect(email).toContain("import { sendPlatformEmail } from '@/lib/email/system'")
    expect(email).toMatch(/sendApprovalEmail[\s\S]*sendPlatformEmail\(/)
    expect(email).not.toMatch(/sendApprovalEmail[\s\S]*getOutboundConfig\(admin, fundId\)/)
  })

  it('routes the public contact form through the shared platform sender', () => {
    const route = source('app/api/contact/route.ts')
    expect(route).toContain("import { sendPlatformEmail } from '@/lib/email/system'")
    expect(route).toContain('await sendPlatformEmail({')
    expect(route).not.toContain('new Resend(')
    expect(route).not.toContain('CONTACT_FROM')
  })

  it('routes the weekly deals digest through platform mail, not a Fund provider', () => {
    const route = source('app/api/cron/deals-digest/route.ts')
    expect(route).toContain("import { sendPlatformEmail } from '@/lib/email/system'")
    expect(route).toContain('await sendPlatformEmail({')
    expect(route).not.toContain('getOutboundConfig')
    expect(route).not.toContain('sendOutboundEmail')
  })

  it('routes note notifications through platform mail, not a Fund provider', () => {
    const notifier = source('lib/notes/notify.ts')
    expect(notifier).toContain("import { sendPlatformEmail } from '@/lib/email/system'")
    expect(notifier).toContain('await sendPlatformEmail({')
    expect(notifier).not.toContain('getOutboundConfig')
    expect(notifier).not.toContain('sendOutboundEmail')
  })
})
