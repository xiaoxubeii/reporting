/* eslint-disable @typescript-eslint/no-explicit-any -- focused Supabase query double */
import { describe, expect, it } from 'vitest'
import { readExpertEmailThread } from './fund-thread-read'

const request = {
  id: 'request-1',
  fund_id: 'fund-1',
  deal_id: 'deal-1',
  email_thread_id: 'thread-1',
}

const thread = {
  id: 'thread-1',
  fund_id: 'fund-1',
  context_type: 'diligence_expert_request',
  context_id: 'request-1',
  subject: 'Expert invitation',
  status: 'open',
  external_participant_address: 'expert@example.test',
  created_at: '2026-07-26T00:00:00.000Z',
  updated_at: '2026-07-26T01:00:00.000Z',
}

const message = {
  id: 'message-1',
  fund_id: 'fund-1',
  thread_id: 'thread-1',
  direction: 'inbound',
  from_address: 'Expert <expert@example.test>',
  to_addresses: ['alice@cci.fundworkspace.com'],
  subject: 'Re: Expert invitation',
  text_body: 'This is the safe reply.',
  html_body_untrusted: '<img src="https://tracker.test/pixel" onerror="steal()">',
  provider_message_id: 'provider-secret-id',
  attachment_metadata: [{
    id: 'provider-attachment-id',
    filename: 'answer.pdf',
    size: 321,
    contentType: 'application/pdf',
    storagePath: 'fund-email/fund-1/private/answer.pdf',
    sha256: 'private-hash',
  }],
  provider_submitted_at: null,
  received_at: '2026-07-26T01:00:00.000Z',
  created_at: '2026-07-26T01:00:00.000Z',
}

describe('readExpertEmailThread', () => {
  it('scopes every lookup to the live Fund and business context, returning plain text only', async () => {
    const { admin, calls } = fakeAdmin({
      diligence_expert_requests: [request],
      fund_email_threads: [thread],
      fund_email_messages: [message],
    })

    const result = await readExpertEmailThread(admin as any, {
      fundId: 'fund-1',
      dealId: 'deal-1',
      requestId: 'request-1',
    })

    expect(result).toEqual({
      id: 'thread-1',
      subject: 'Expert invitation',
      status: 'open',
      participantAddress: 'expert@example.test',
      renderingPolicy: 'plain_text_only',
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T01:00:00.000Z',
      messages: [{
        id: 'message-1',
        direction: 'inbound',
        from: 'Expert <expert@example.test>',
        to: ['alice@cci.fundworkspace.com'],
        subject: 'Re: Expert invitation',
        body: { kind: 'plain_text', text: 'This is the safe reply.' },
        attachments: [{ filename: 'answer.pdf', contentType: 'application/pdf', sizeBytes: 321 }],
        occurredAt: '2026-07-26T01:00:00.000Z',
      }],
    })
    expect(JSON.stringify(result)).not.toContain('html_body_untrusted')
    expect(JSON.stringify(result)).not.toContain('onerror')
    expect(JSON.stringify(result)).not.toContain('storagePath')
    expect(JSON.stringify(result)).not.toContain('provider-secret-id')
    expect(JSON.stringify(result)).not.toContain('private-hash')

    expect(callsFor(calls, 'diligence_expert_requests')[0]?.filters).toEqual(expect.arrayContaining([
      ['id', 'request-1'], ['deal_id', 'deal-1'], ['fund_id', 'fund-1'],
    ]))
    expect(callsFor(calls, 'fund_email_threads')[0]?.filters).toEqual(expect.arrayContaining([
      ['id', 'thread-1'], ['fund_id', 'fund-1'],
      ['context_type', 'diligence_expert_request'], ['context_id', 'request-1'],
    ]))
    expect(callsFor(calls, 'fund_email_messages')[0]?.filters).toEqual(expect.arrayContaining([
      ['thread_id', 'thread-1'], ['fund_id', 'fund-1'],
    ]))
    expect(callsFor(calls, 'fund_email_messages')[0]?.columns).not.toContain('html_body_untrusted')
  })

  it('fails closed without revealing a request or thread from another Fund', async () => {
    const { admin, calls } = fakeAdmin({
      diligence_expert_requests: [{ ...request, fund_id: 'fund-2' }],
      fund_email_threads: [{ ...thread, fund_id: 'fund-2' }],
      fund_email_messages: [{ ...message, fund_id: 'fund-2' }],
    })

    await expect(readExpertEmailThread(admin as any, {
      fundId: 'fund-1', dealId: 'deal-1', requestId: 'request-1',
    })).resolves.toBeNull()
    expect(callsFor(calls, 'fund_email_threads')).toHaveLength(0)
    expect(callsFor(calls, 'fund_email_messages')).toHaveLength(0)
  })

  it('returns an empty conversation when the authorized thread has no messages', async () => {
    const { admin } = fakeAdmin({
      diligence_expert_requests: [request],
      fund_email_threads: [thread],
      fund_email_messages: [],
    })

    const result = await readExpertEmailThread(admin as any, {
      fundId: 'fund-1', dealId: 'deal-1', requestId: 'request-1',
    })
    expect(result?.messages).toEqual([])
  })

  it('recovers the latest context-bound thread when the request link write was lost', async () => {
    const newerThread = {
      ...thread,
      id: 'thread-2',
      updated_at: '2026-07-26T02:00:00.000Z',
    }
    const { admin, calls } = fakeAdmin({
      diligence_expert_requests: [{ ...request, email_thread_id: null }],
      fund_email_threads: [thread, newerThread],
      fund_email_messages: [{ ...message, thread_id: 'thread-2' }],
    })

    const result = await readExpertEmailThread(admin as any, {
      fundId: 'fund-1', dealId: 'deal-1', requestId: 'request-1',
    })

    expect(result?.id).toBe('thread-2')
    expect(callsFor(calls, 'fund_email_threads')[0]?.filters).not.toContainEqual(['id', 'thread-1'])
    expect(callsFor(calls, 'fund_email_threads')[0]?.filters).toEqual(expect.arrayContaining([
      ['fund_id', 'fund-1'], ['context_type', 'diligence_expert_request'], ['context_id', 'request-1'],
    ]))
  })
})

type Call = { table: string; columns: string; filters: Array<[string, unknown]> }

function callsFor(calls: Call[], table: string) {
  return calls.filter(call => call.table === table)
}

function fakeAdmin(fixtures: Record<string, Array<Record<string, unknown>>>) {
  const calls: Call[] = []
  return {
    calls,
    admin: {
      from(table: string) {
        const call: Call = { table, columns: '', filters: [] }
        calls.push(call)
        let orderBy: { field: string; ascending: boolean } | null = null
        let rowLimit: number | null = null
        const matchingRows = () => {
          const rows = (fixtures[table] ?? []).filter(row => (
            call.filters.every(([field, value]) => row[field] === value)
          ))
          const ordering = orderBy
          const ordered = ordering
            ? [...rows].sort((left, right) => String(left[ordering.field]).localeCompare(String(right[ordering.field])) * (ordering.ascending ? 1 : -1))
            : rows
          return rowLimit === null ? ordered : ordered.slice(0, rowLimit)
        }
        const result = () => ({ data: matchingRows(), error: null })
        const chain = {
          select(columns: string) { call.columns = columns; return chain },
          eq(field: string, value: unknown) { call.filters.push([field, value]); return chain },
          order(field: string, options?: { ascending?: boolean }) {
            orderBy = { field, ascending: options?.ascending ?? true }
            return chain
          },
          limit(value: number) { rowLimit = value; return chain },
          maybeSingle: async () => ({ data: matchingRows()[0] ?? null, error: null }),
          then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
            return Promise.resolve(result()).then(resolve, reject)
          },
        }
        return chain
      },
    },
  }
}
