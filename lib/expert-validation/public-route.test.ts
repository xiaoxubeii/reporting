import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createInvitationToken } from './token'

const rateLimit = vi.hoisted(() => vi.fn())
const resolvePublicInvitation = vi.hoisted(() => vi.fn())
const submitPublicResponse = vi.hoisted(() => vi.fn())
const materializeExpertResponse = vi.hoisted(() => vi.fn())
const recordMaterializationError = vi.hoisted(() => vi.fn())

vi.mock('@/lib/rate-limit', () => ({ getClientIp: () => '203.0.113.8', rateLimit }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/expert-validation/public', async () => {
  const actual = await vi.importActual<typeof import('./public')>('./public')
  return { ...actual, resolvePublicInvitation, submitPublicResponse }
})
vi.mock('@/lib/expert-validation/materialize', () => ({ materializeExpertResponse, recordMaterializationError }))

import { POST as resolveRoute } from '@/app/api/public/expert-response/resolve/route'
import { POST as submitRoute } from '@/app/api/public/expert-response/submit/route'

beforeEach(() => {
  rateLimit.mockReset()
  resolvePublicInvitation.mockReset()
  submitPublicResponse.mockReset()
  materializeExpertResponse.mockReset()
  recordMaterializationError.mockReset()
  rateLimit.mockResolvedValue(null)
})

describe('public expert response routes', () => {
  it('returns a valid invitation with no-store, no-referrer, and no cookie', async () => {
    const credential = createInvitationToken()
    resolvePublicInvitation.mockResolvedValue({
      invitationParty: 'Fund One', deadline: '2099-01-01T00:00:00.000Z', question: 'Question?',
      contextSnapshot: 'Context', responseInstructions: 'Answer directly', submittedAt: null,
    })
    const response = await resolveRoute(jsonRequest('/resolve', { token: credential.rawToken }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ invitation: { question: 'Question?' } })
    expectSecureHeaders(response)
  })

  it.each([
    ['invalid token', { token: 'invalid' }],
    ['oversized body', { token: 'A'.repeat(43), padding: 'x'.repeat(60_000) }],
  ])('uses one generic non-enumerating response for %s', async (_label, body) => {
    const response = await resolveRoute(jsonRequest('/resolve', body))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'This invitation is invalid or no longer available.' })
    expectSecureHeaders(response)
  })

  it('materializes a first submission and skips duplicate materialization', async () => {
    const credential = createInvitationToken()
    submitPublicResponse
      .mockResolvedValueOnce({ requestId: 'request-1', submittedAt: '2030-01-01T00:00:00.000Z', alreadySubmitted: false })
      .mockResolvedValueOnce({ requestId: 'request-1', submittedAt: '2030-01-01T00:00:00.000Z', alreadySubmitted: true })
    materializeExpertResponse.mockResolvedValue({ documentId: 'document-1', enqueued: true })

    const first = await submitRoute(jsonRequest('/submit', { token: credential.rawToken, response_markdown: 'Expert answer' }))
    const duplicate = await submitRoute(jsonRequest('/submit', { token: credential.rawToken, response_markdown: 'Expert answer' }))

    expect(first.status).toBe(200)
    expect(duplicate.status).toBe(200)
    expect(materializeExpertResponse).toHaveBeenCalledTimes(1)
    expectSecureHeaders(first)
    expectSecureHeaders(duplicate)
  })

  it('records materialization failure without making the accepted response resubmittable', async () => {
    const credential = createInvitationToken()
    submitPublicResponse.mockResolvedValue({
      requestId: 'request-1', submittedAt: '2030-01-01T00:00:00.000Z', alreadySubmitted: false,
    })
    materializeExpertResponse.mockRejectedValue(new Error('storage unavailable'))
    const response = await submitRoute(jsonRequest('/submit', {
      token: credential.rawToken,
      response_markdown: 'Accepted expert answer',
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ submitted: true })
    expect(recordMaterializationError).toHaveBeenCalledWith(expect.anything(), 'request-1', expect.any(Error))
  })
})

function jsonRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`https://reporting.example.test/api/public/expert-response${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function expectSecureHeaders(response: Response): void {
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(response.headers.get('cdn-cache-control')).toBe('no-store')
  expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store')
  expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  expect(response.headers.get('set-cookie')).toBeNull()
}
