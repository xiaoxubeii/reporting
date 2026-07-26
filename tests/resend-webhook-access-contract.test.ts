import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { UNGATED_ROUTES } from '@/lib/access/route-domains'

const ROUTE = readFileSync(
  new URL('../app/api/inbound-email/resend/[routeToken]/route.ts', import.meta.url),
  'utf8',
)
const RUNTIME = readFileSync(
  new URL('../lib/email/resend-webhook-runtime.ts', import.meta.url),
  'utf8',
)

describe('Resend inbound access contract', () => {
  it('has one explicit ungated decision justified by path token plus provider signature', () => {
    expect(UNGATED_ROUTES['api/inbound-email/resend/[routeToken]']).toMatch(
      /path token.*Svix signature/i,
    )
  })

  it('derives identity from the path token and has no Session authentication path', () => {
    expect(ROUTE).toMatch(/params\.routeToken/)
    expect(ROUTE).toMatch(/handleResendInboundWebhook/)
    expect(RUNTIME).toMatch(/resolveVerifiedFundEmailReceivingConnectionByRouteToken/)
    expect(RUNTIME).toMatch(/inbound_email_provider[\s\S]*!== 'resend'/)
    expect(`${ROUTE}\n${RUNTIME}`).not.toMatch(
      /getUser|getSession|getCurrentFund|requireFund|requireAuth|authorization/i,
    )
  })
})
