import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { createAdminClient } from '@/lib/supabase/admin'
import { issueInvitation } from './invitation'

const sendFundThreadEmail = vi.hoisted(() => vi.fn())
const getOutboundConfig = vi.hoisted(() => vi.fn())
const sendOutboundEmail = vi.hoisted(() => vi.fn())

vi.mock('@/lib/email/fund-outbound', () => ({ sendFundThreadEmail }))
vi.mock('@/lib/email', () => ({ getOutboundConfig, sendOutboundEmail }))

type Admin = ReturnType<typeof createAdminClient>
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://reporting.example.test'
  sendFundThreadEmail.mockReset()
  sendFundThreadEmail.mockResolvedValue({
    id: 'provider-message-1',
    threadId: 'thread-1',
    messageId: 'message-1',
    reused: false,
  })
  getOutboundConfig.mockReset()
  getOutboundConfig.mockResolvedValue({ provider: 'resend', apiKey: 're_test' })
  sendOutboundEmail.mockReset()
  sendOutboundEmail.mockResolvedValue({ id: 'provider-message-fallback' })
})

afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl
})

describe('expert invitation issuance', () => {
  it('persists only the token hash and records provider acceptance separately', async () => {
    const { admin, state } = invitationAdmin()
    const result = await issueInvitation({ admin, fundId: 'fund-1', actorUserId: 'user-1', dealId: 'deal-1', requestId: 'request-1' })

    expect(result.emailAccepted).toBe(true)
    expect(result.invitationUrl).toMatch(/^https:\/\/reporting\.example\.test\/expert-response#token=[A-Za-z0-9_-]{43}$/)
    expect(state.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(result.invitationUrl).not.toContain(state.token_hash as string)
    expect(state.email_provider_accepted_at).not.toBeNull()
    expect(state.email_message_id).toBe('provider-message-1')
    expect(state.email_thread_id).toBe('thread-1')
    expect(result.request.emailThreadId).toBe('thread-1')
    expect(sendFundThreadEmail).toHaveBeenCalledTimes(1)
    const message = sendFundThreadEmail.mock.calls[0]?.[1] as {
      fundId: string
      actorUserId: string
      operationId: string
      fallbackMailbox: string
      purpose: string
      contextType: string
      contextId: string
      to: string
      html: string
    }
    expect(message).toMatchObject({
      fundId: 'fund-1',
      actorUserId: 'user-1',
      fallbackMailbox: 'expert',
      purpose: 'expert_invitation',
      contextType: 'diligence_expert_request',
      contextId: 'request-1',
      to: 'ada@example.test',
    })
    expect(message.operationId).toMatch(/^expert-invitation:request-1:[0-9a-f]{64}$/)
    expect(message.to).toBe('ada@example.test')
    expect(message.html).not.toContain('Can the plant reach 92% yield?')
    expect(message.html).not.toContain('Sensitive context')
  })

  it('keeps the invitation usable and persists only a sanitized provider failure', async () => {
    sendFundThreadEmail.mockRejectedValueOnce(new Error('mail failed https://provider.test/message secret-token-abcdefghijklmnopqrstuvwxyz'))
    const { admin, state } = invitationAdmin()
    const result = await issueInvitation({ admin, fundId: 'fund-1', actorUserId: 'user-1', dealId: 'deal-1', requestId: 'request-1' })

    expect(result.emailAccepted).toBe(false)
    expect(result.warning).toContain('send it manually')
    expect(state.status).toBe('invited')
    expect(state.email_error_message).not.toContain('https://')
    expect(state.email_error_message).not.toContain('secret-token')
  })

  it('preserves expert invitation delivery through a selected non-Resend provider', async () => {
    getOutboundConfig.mockResolvedValueOnce({ provider: 'postmark', serverToken: 'pm_test' })
    const { admin, state } = invitationAdmin()
    const result = await issueInvitation({ admin, fundId: 'fund-1', actorUserId: 'user-1', dealId: 'deal-1', requestId: 'request-1' })

    expect(result.emailAccepted).toBe(true)
    expect(sendFundThreadEmail).not.toHaveBeenCalled()
    expect(sendOutboundEmail).toHaveBeenCalledWith(
      { provider: 'postmark', serverToken: 'pm_test' },
      expect.objectContaining({
        to: 'ada@example.test',
        subject: 'Invitation to provide an expert perspective',
      }),
    )
    expect(state.email_message_id).toBe('provider-message-fallback')
    expect(state.email_thread_id).toBeNull()
  })

  it('reports provider acceptance without hiding a failed thread-link write', async () => {
    const { admin, state } = invitationAdmin({}, { failAcceptanceUpdate: true })
    const result = await issueInvitation({
      admin,
      fundId: 'fund-1',
      actorUserId: 'user-1',
      dealId: 'deal-1',
      requestId: 'request-1',
    })

    expect(result.emailAccepted).toBe(true)
    expect(result.warning).toContain('accepted')
    expect(result.warning).toContain('tracking')
    expect(result.request.emailThreadId).toBe('thread-1')
    expect(state.email_thread_id).toBeNull()
    expect(state.email_error_message).toContain('tracking state')
    expect(sendFundThreadEmail).toHaveBeenCalledTimes(1)
  })

  it.each([
    { label: 'initial issue', reissue: false },
    { label: 'reissue', reissue: true },
  ])('allows only one concurrent $label to send email', async ({ reissue }) => {
    const { admin, state } = invitationAdmin(reissue ? {
      status: 'invited', token_hash: 'a'.repeat(64),
      expires_at: '2099-01-01T00:00:00.000Z', invited_at: '2030-01-01T00:00:00.000Z',
    } : {})

    const settled = await Promise.allSettled([
      issueInvitation({ admin, fundId: 'fund-1', actorUserId: 'user-1', dealId: 'deal-1', requestId: 'request-1', reissue }),
      issueInvitation({ admin, fundId: 'fund-1', actorUserId: 'user-1', dealId: 'deal-1', requestId: 'request-1', reissue }),
    ])

    expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(settled.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(sendFundThreadEmail).toHaveBeenCalledTimes(1)
    expect(state.status).toBe('invited')
    expect(state.token_hash).toMatch(/^[0-9a-f]{64}$/)
    if (reissue) expect(state.token_hash).not.toBe('a'.repeat(64))
  })
})

type InvitationRow = Record<string, unknown> & {
  id: string
  fund_id: string
  deal_id: string
  status: 'draft' | 'invited' | 'submitted'
  token_hash: string | null
  response_markdown: string | null
}

function invitationAdmin(
  overrides: Partial<InvitationRow> = {},
  options: { failAcceptanceUpdate?: boolean } = {},
) {
  const state: InvitationRow = {
    id: 'request-1', fund_id: 'fund-1', deal_id: 'deal-1', created_by: 'user-1',
    source_kind: 'research_gap', source_ref: { draftId: 'draft-1', kind: 'research_gap', index: 0, snapshot: {} },
    question: 'Can the plant reach 92% yield?', expert_profile: 'Factory operator', context_snapshot: 'Sensitive context',
    expert_id: 'expert-1', selection_method: 'manual', expert_name: 'Ada', expert_email: 'ada@example.test',
    expert_snapshot: { name: 'Ada', title: 'COO', organization: 'Factory', profileText: 'Operator' },
    expert_verification_type: 'fund_confirmed', expert_source_type: 'manual', expert_verified_at: '2030-01-01T00:00:00.000Z',
    token_hash: null, expires_at: null, invited_at: null, email_provider_accepted_at: null,
    email_message_id: null, email_thread_id: null, email_error_code: null, email_error_message: null,
    response_markdown: null, submitted_at: null, document_id: null, materialization_error: null,
    status: 'draft', created_at: '2030-01-01T00:00:00.000Z', updated_at: '2030-01-01T00:00:00.000Z',
    ...overrides,
  }

  const admin = {
    from(table: string) {
      if (table === 'funds') return staticResult({ name: 'Fund One' })
      if (table === 'experts') return staticResult({
        id: 'expert-1', scope: 'fund', fund_id: 'fund-1', status: 'active',
        verification_type: 'fund_confirmed', source_type: 'manual',
        verified_at: '2030-01-01T00:00:00.000Z', verified_by: 'user-1',
      })
      let updateValues: Record<string, unknown> | null = null
      const equals = new Map<string, unknown>()
      const nullFields = new Set<string>()
      const execute = () => {
        const matches = Array.from(equals.entries()).every(([field, value]) => state[field] === value)
          && Array.from(nullFields).every(field => state[field] === null)
        if (!matches) return { data: null, error: null }
        if (options.failAcceptanceUpdate && updateValues?.email_provider_accepted_at) {
          return { data: null, error: { message: 'tracking state write failed' } }
        }
        if (updateValues) Object.assign(state, updateValues)
        return { data: { ...state }, error: null }
      }
      const chain = {
        select: () => chain,
        update: (values: Record<string, unknown>) => {
          updateValues = values
          return chain
        },
        eq: (field: string, value: unknown) => {
          equals.set(field, value)
          return chain
        },
        is: (field: string, value: null) => {
          if (value === null) nullFields.add(field)
          return chain
        },
        maybeSingle: async () => execute(),
        single: async () => execute(),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
      }
      return chain
    },
  } as unknown as Admin
  return { admin, state }
}

function staticResult(data: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data, error: null }),
  }
  return chain
}
