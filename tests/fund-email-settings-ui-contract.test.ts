import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

describe('Fund email Settings UI contract', () => {
  const component = source('components/settings/fund-email-settings.tsx')
  const page = source('app/(app)/settings/page.tsx')
  const english = JSON.parse(source('messages/en.json')).Settings.fundEmail
  const chinese = JSON.parse(source('messages/zh-CN.json')).Settings.fundEmail

  it('integrates Fund Resend controls into outbound and inbound settings', () => {
    expect(component).toContain("useTranslations('Settings.fundEmail')")
    expect(component).toContain("action: 'set_mailbox'")
    expect(component).toContain("action: 'configure_identity'")
    expect(component).toContain("action: 'configure_inbound'")
    expect(component).toContain("action: 'recreate_inbound_webhook'")
    expect(component).toContain('receivingApiKey: receivingKey')
    expect(component).not.toContain('sendingApiKey:')
    expect(component).not.toContain('webhookSecret')
    expect(component).not.toContain('fund-email-webhook-secret')
    expect(component).toMatch(/status\.isAdmin\s*&&/)
    expect(component).toContain('export function FundResendOutboundProviderFields')
    expect(component).toContain('export function FundResendInboundProviderFields')
    expect(component).not.toContain("from '@/components/settings/section'")
    expect(component).not.toContain('<Section')
    expect(page).toContain("<option value=\"resend\">Resend</option>")
    expect(page).toMatch(/selectedProvider === 'resend'[\s\S]*<FundResendInboundProviderFields/)
    expect(page).toMatch(/activeProviders\.has\('resend'\)[\s\S]*<FundResendOutboundProviderFields/)
    expect(page).not.toContain('<FundEmailOutboundSettings />')
    expect(page).not.toContain('<FundEmailInboundSettings />')
    expect(page).not.toContain('<FundEmailSettings />')
    expect(page).toContain('payload.resendApiKey = resendKey.trim()')
    expect(page).toMatch(/useEffect\(\(\) => \{\s*setSelectedProvider\(provider \|\| ''\)\s*\}, \[provider\]\)/)
  })

  it('uses the server-provided base domain and localizes provider statuses', () => {
    expect(component).toContain('baseDomain: string')
    expect(component).toContain('status.baseDomain')
    expect(component).not.toContain('.fundworkspace.com</span>')
    expect(component).toContain("t('statuses.verified')")
    expect(component).toContain("t('statuses.pending')")
    expect(component).toContain("t('statuses.failed')")
    expect(component).toContain("t('statuses.unknown')")
  })

  it('keeps the Fund email message trees aligned', () => {
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort())
    expect(Object.keys(chinese.statuses).sort()).toEqual(Object.keys(english.statuses).sort())
  })
})
