import { describe, expect, it } from 'vitest'
import type { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'
import { readJson } from './api'
import { createInvitationToken, hashInvitationToken } from './token'
import {
  PUBLIC_INVITATION_ERROR,
  rateKey,
  resolvePublicInvitation,
  submitPublicResponse,
  validateRawToken,
} from './public'

type Admin = ReturnType<typeof createAdminClient>

describe('public expert response service', () => {
  it('returns the bounded invitation without contact or internal identity fields', async () => {
    const credential = createInvitationToken()
    const { admin } = publicAdmin({ tokenHash: credential.tokenHash })
    const invitation = await resolvePublicInvitation(admin, credential.rawToken)

    expect(invitation).toMatchObject({
      invitationParty: 'Fund One',
      question: 'Can the plant reach 92% yield?',
      contextSnapshot: 'Sanitized context only',
      submittedAt: null,
    })
    expect(invitation).not.toHaveProperty('expertEmail')
    expect(invitation).not.toHaveProperty('fundId')
  })

  it.each([
    ['malformed', 'not-a-token'],
    ['expired', 'expired'],
    ['rotated', 'rotated'],
  ])('uses the same non-enumerating error for %s credentials', async (_label, variant) => {
    const credential = createInvitationToken()
    const rawToken = variant === 'not-a-token' ? 'not-a-token' : credential.rawToken
    const tokenHash = variant === 'rotated' ? hashInvitationToken(createInvitationToken().rawToken) : credential.tokenHash
    const expiresAt = variant === 'expired' ? '2020-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z'
    const { admin } = publicAdmin({ tokenHash, expiresAt })

    await expect(resolvePublicInvitation(admin, rawToken)).rejects.toThrow(PUBLIC_INVITATION_ERROR)
  })

  it('allows exactly one concurrent submission and makes the duplicate idempotent', async () => {
    const credential = createInvitationToken()
    const { admin, state } = publicAdmin({ tokenHash: credential.tokenHash })

    const results = await Promise.all([
      submitPublicResponse({ admin, rawToken: credential.rawToken, responseMarkdown: 'Answer A' }),
      submitPublicResponse({ admin, rawToken: credential.rawToken, responseMarkdown: 'Answer B' }),
    ])

    expect(results.filter(result => !result.alreadySubmitted)).toHaveLength(1)
    expect(results.filter(result => result.alreadySubmitted)).toHaveLength(1)
    expect(['Answer A', 'Answer B']).toContain(state.responseMarkdown)
    expect(state.status).toBe('submitted')
  })

  it('rejects submission after expiry with the same generic error', async () => {
    const credential = createInvitationToken()
    const { admin } = publicAdmin({ tokenHash: credential.tokenHash, expiresAt: '2020-01-01T00:00:00.000Z' })
    await expect(submitPublicResponse({
      admin,
      rawToken: credential.rawToken,
      responseMarkdown: 'Late answer',
    })).rejects.toThrow(PUBLIC_INVITATION_ERROR)
  })

  it('binds resolution and submission to the expected Host Fund', async () => {
    const credential = createInvitationToken()
    const { admin } = publicAdmin({ tokenHash: credential.tokenHash, fundId: 'fund-alpha' })
    await expect(resolvePublicInvitation(admin, credential.rawToken, 'fund-beta'))
      .rejects.toThrow(PUBLIC_INVITATION_ERROR)
    await expect(submitPublicResponse({
      admin,
      rawToken: credential.rawToken,
      responseMarkdown: 'Cross-Fund answer',
      expectedFundId: 'fund-beta',
    })).rejects.toThrow(PUBLIC_INVITATION_ERROR)
  })

  it('hashes IP and token rate-limit keys without retaining the credential', () => {
    const credential = createInvitationToken()
    const tokenKey = rateKey('token', credential.rawToken)
    const ipKey = rateKey('ip', '203.0.113.8')
    expect(tokenKey).toMatch(/^expert-response:token:[0-9a-f]{64}$/)
    expect(ipKey).toMatch(/^expert-response:ip:[0-9a-f]{64}$/)
    expect(tokenKey).not.toContain(credential.rawToken)
    expect(validateRawToken(credential.rawToken)).toBe(credential.rawToken)
  })

  it('rejects oversized and non-JSON request bodies before parsing', async () => {
    const oversized = new NextRequest('https://reporting.example.test/api/public/expert-response/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '60000' },
      body: '{}',
    })
    const wrongType = new NextRequest('https://reporting.example.test/api/public/expert-response/submit', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    })
    await expect(readJson(oversized, 55_000)).rejects.toThrow('too large')
    await expect(readJson(wrongType, 55_000)).rejects.toThrow('Content-Type')
  })
})

type PublicState = {
  id: string
  fundId: string
  tokenHash: string
  question: string
  contextSnapshot: string
  expiresAt: string
  status: 'invited' | 'submitted'
  submittedAt: string | null
  responseMarkdown: string | null
}

function publicAdmin(overrides: Partial<PublicState>) {
  const state: PublicState = {
    id: 'request-1',
    fundId: 'fund-1',
    tokenHash: '',
    question: 'Can the plant reach 92% yield?',
    contextSnapshot: 'Sanitized context only',
    expiresAt: '2099-01-01T00:00:00.000Z',
    status: 'invited',
    submittedAt: null,
    responseMarkdown: null,
    ...overrides,
  }

  const admin = {
    from(table: string) {
      if (table === 'funds') return resultChain({ name: 'Fund One' })
      let values: Record<string, unknown> | null = null
      const equals = new Map<string, unknown>()
      const greaterThan = new Map<string, string>()
      const nullFields = new Set<string>()
      const chain = {
        select: () => chain,
        update: (next: Record<string, unknown>) => {
          values = next
          return chain
        },
        eq: (field: string, value: unknown) => {
          equals.set(field, value)
          return chain
        },
        gt: (field: string, value: string) => {
          greaterThan.set(field, value)
          return chain
        },
        is: (field: string, value: null) => {
          if (value === null) nullFields.add(field)
          return chain
        },
        maybeSingle: async () => {
          const matches = (!equals.has('token_hash') || equals.get('token_hash') === state.tokenHash)
            && (!equals.has('fund_id') || equals.get('fund_id') === state.fundId)
            && (!equals.has('status') || equals.get('status') === state.status)
            && (!greaterThan.has('expires_at') || state.expiresAt > (greaterThan.get('expires_at') as string))
            && (!nullFields.has('response_markdown') || state.responseMarkdown === null)
          if (!matches) return { data: null, error: null }
          if (values) {
            state.responseMarkdown = values.response_markdown as string
            state.submittedAt = values.submitted_at as string
            state.status = values.status as PublicState['status']
            return { data: { id: state.id, submitted_at: state.submittedAt }, error: null }
          }
          return {
            data: {
              id: state.id,
              fund_id: state.fundId,
              token_hash: state.tokenHash,
              question: state.question,
              context_snapshot: state.contextSnapshot,
              expires_at: state.expiresAt,
              status: state.status,
              submitted_at: state.submittedAt,
            },
            error: null,
          }
        },
      }
      return chain
    },
  } as unknown as Admin
  return { admin, state }
}

function resultChain(data: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data, error: null }),
  }
  return chain
}
