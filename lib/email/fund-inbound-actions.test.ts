/* eslint-disable @typescript-eslint/no-explicit-any -- tests inject minimal provider and Supabase doubles */
import { describe, expect, it, vi } from 'vitest'
import {
  dispatchFundInboundBusinessAction,
  type FundInboundActionDependencies,
} from './fund-inbound-actions'
import type { RetrievedResendInboundEmail } from './resend-inbound'

const email: RetrievedResendInboundEmail = {
  providerEmailId: 'email-1',
  internetMessageId: '<incoming@example.com>',
  from: 'Founder <founder@example.com>',
  to: ['pitch@cci.fundworkspace.com'],
  cc: [],
  bcc: [],
  replyTo: [],
  subject: 'NewCo pitch',
  text: 'We are building a cardiovascular platform.',
  htmlUntrusted: '<p>We are building a cardiovascular platform.</p>',
  inReplyTo: null,
  references: [],
  receivedAt: '2026-07-26T00:00:00.000Z',
  attachments: [],
  quarantineReason: null,
}
const connection = { id: 'connection-1', fundId: 'fund-1', domain: 'cci.fundworkspace.com' } as any
const pitchRouting = {
  disposition: 'routed' as const,
  source: 'mailbox' as const,
  threadId: null,
  mailboxId: 'mailbox-1',
  localPart: 'pitch',
  purpose: 'pitch' as const,
}

function dependencies(overrides: Partial<FundInboundActionDependencies> = {}): FundInboundActionDependencies {
  return {
    createOrLoadInboundEmail: vi.fn().mockResolvedValue({
      id: 'inbound-email-1',
      processingStatus: 'pending',
    }),
    hydrateAttachments: vi.fn(async payload => payload),
    extractAttachments: vi.fn().mockResolvedValue({
      emailBody: email.text,
      attachments: [],
    }),
    getDealProvider: vi.fn().mockResolvedValue({
      provider: { name: 'test-provider' },
      providerType: 'test',
      model: 'test-model',
    }),
    processDeal: vi.fn().mockResolvedValue({ dealId: 'deal-1', lowFit: false, reviewFlagged: false }),
    finalizeEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('dispatchFundInboundBusinessAction', () => {
  it('sends a new exact pitch-mailbox message through the existing Deal screening path', async () => {
    const deps = dependencies()

    await dispatchFundInboundBusinessAction({
      admin: {} as any,
      connection,
      email,
      routing: pitchRouting,
      persisted: { messageId: 'message-1', threadId: 'thread-1', reused: false },
      dependencies: deps,
    })

    expect(deps.createOrLoadInboundEmail).toHaveBeenCalledWith(expect.objectContaining({
      fundId: 'fund-1',
      threadId: 'thread-1',
      providerEmailId: 'email-1',
      email,
    }))
    expect(deps.processDeal).toHaveBeenCalledWith(expect.objectContaining({
      emailId: 'inbound-email-1',
      fundId: 'fund-1',
      introSourceOverride: 'email',
      signal: expect.any(AbortSignal),
    }))
    const signal = (deps.processDeal as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.signal as AbortSignal
    expect(signal.aborted).toBe(false)
    expect(deps.finalizeEmail).toHaveBeenCalledWith(
      expect.anything(),
      'inbound-email-1',
      { status: 'success' },
    )
  })

  it('does not turn pitch-thread replies or expert replies into business submissions', async () => {
    const deps = dependencies()
    await dispatchFundInboundBusinessAction({
      admin: {} as any,
      connection,
      email: { ...email, inReplyTo: '<outbound@example.com>' },
      routing: {
        disposition: 'routed',
        source: 'reply_token',
        threadId: 'thread-1',
        mailboxId: 'mailbox-1',
        purpose: 'pitch',
      },
      persisted: { messageId: 'message-2', threadId: 'thread-1', reused: false },
      dependencies: deps,
    })
    await dispatchFundInboundBusinessAction({
      admin: {} as any,
      connection,
      email,
      routing: {
        disposition: 'routed',
        source: 'reply_token',
        threadId: 'expert-thread-1',
        mailboxId: 'expert-mailbox-1',
        purpose: 'expert_invitation',
      },
      persisted: { messageId: 'message-3', threadId: 'expert-thread-1', reused: false },
      dependencies: deps,
    })

    expect(deps.createOrLoadInboundEmail).not.toHaveBeenCalled()
    expect(deps.processDeal).not.toHaveBeenCalled()
  })

  it('does not rerun a Deal whose idempotent inbound record already succeeded', async () => {
    const deps = dependencies({
      createOrLoadInboundEmail: vi.fn().mockResolvedValue({
        id: 'inbound-email-1',
        processingStatus: 'success',
      }),
    })

    await dispatchFundInboundBusinessAction({
      admin: {} as any,
      connection,
      email,
      routing: pitchRouting,
      persisted: { messageId: 'message-1', threadId: 'thread-1', reused: true },
      dependencies: deps,
    })

    expect(deps.processDeal).not.toHaveBeenCalled()
  })

  it('records a safe failed state and lets the webhook retry when screening fails', async () => {
    const deps = dependencies({
      processDeal: vi.fn().mockRejectedValue(new Error('provider secret detail')),
    })

    await expect(dispatchFundInboundBusinessAction({
      admin: {} as any,
      connection,
      email,
      routing: pitchRouting,
      persisted: { messageId: 'message-1', threadId: 'thread-1', reused: false },
      dependencies: deps,
    })).rejects.toThrow('Pitch screening failed')
    expect(deps.finalizeEmail).toHaveBeenCalledWith(
      expect.anything(),
      'inbound-email-1',
      { status: 'failed', warnings: ['Pitch screening failed.'] },
    )
  })
})
