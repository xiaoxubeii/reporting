import { describe, expect, it, vi } from 'vitest'
import { bootstrapFundIdentity, normalizeFundDisplayName, normalizeRequestedFundSlug } from './fund-bootstrap'
import {
  buildFundInvitationLink,
  generateFundInvitationToken,
  hashFundInvitationToken,
  normalizeExternalInvitationEmail,
  normalizeFundInvitationRole,
} from './invitations'
import { normalizePersonalFullName, savePersonalProfile } from './profile'
import { readIdentityJson } from './http'
import { NextRequest } from 'next/server'
import { RESERVED_FUND_NAMESPACE_LABELS } from '@/lib/fund-namespace'
import { normalizeFundEmailSlug } from '@/lib/email/domain'

describe('personal identity', () => {
  it('bounds identity JSON before parsing', async () => {
    const valid = new NextRequest('https://fundworkspace.com/api/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    })
    await expect(readIdentityJson(valid, 64)).resolves.toEqual({ name: 'Alice' })

    const oversized = new NextRequest('https://fundworkspace.com/api/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '1024' },
      body: '{}',
    })
    await expect(readIdentityJson(oversized, 64)).rejects.toMatchObject({
      code: 'invalid_request',
      status: 413,
    })
  })

  it('stops reading a chunked identity body once the byte limit is exceeded', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"name":"'))
        controller.enqueue(new Uint8Array(128).fill(97))
      },
      cancel() {
        cancelled = true
      },
    })
    const request = new NextRequest('https://fundworkspace.com/api/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      duplex: 'half',
    } as never)

    await expect(readIdentityJson(request, 64)).rejects.toMatchObject({ status: 413 })
    expect(cancelled).toBe(true)
  })

  it('normalizes a real name without accepting control characters', () => {
    expect(normalizePersonalFullName('  Alice   Zhang  ')).toBe('Alice Zhang')
    expect(() => normalizePersonalFullName('Alice\nBcc: attacker@example.com')).toThrow('valid real name')
    expect(() => normalizePersonalFullName('')).toThrow('real name')
  })

  it('persists through the atomic profile RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { full_name: 'Alice Zhang' }, error: null })
    await expect(savePersonalProfile({ rpc } as never, {
      userId: 'user-1',
      fullName: ' Alice Zhang ',
    })).resolves.toEqual({ fullName: 'Alice Zhang' })
    expect(rpc).toHaveBeenCalledWith('update_user_profile', {
      p_user_id: 'user-1',
      p_full_name: 'Alice Zhang',
    })
  })
})

describe('Fund identity bootstrap', () => {
  it('normalizes display name and DNS-safe slug', () => {
    expect(normalizeFundDisplayName('  CCI   Ventures ')).toBe('CCI Ventures')
    expect(normalizeRequestedFundSlug(' CCI Ventures ')).toBe('cci-ventures')
    expect(() => normalizeRequestedFundSlug('api')).toThrow('valid Fund workspace')
  })

  it('rejects every reserved label for both tenant and email identity', () => {
    for (const label of Array.from(RESERVED_FUND_NAMESPACE_LABELS)) {
      expect(() => normalizeRequestedFundSlug(label), label).toThrow('workspace')
      expect(() => normalizeFundEmailSlug(label), label).toThrow('reserved')
    }
  })

  it('uses one service RPC and keeps optional AI configuration optional', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ fund_id: 'fund-1', slug: 'cci' }],
      error: null,
    })
    const maybeSingle = vi.fn().mockResolvedValue({ data: { slug: 'cci' }, error: null })
    const admin = {
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    }
    const result = await bootstrapFundIdentity(admin as never, {
      actorUserId: 'user-1',
      fundName: 'CCI',
      slug: 'CCI',
    }, {
      ENCRYPTION_KEY: '11'.repeat(32),
      FUND_WORKSPACE_ROOT_DOMAIN: 'fundworkspace.com',
    })

    expect(result).toEqual({
      fundId: 'fund-1',
      slug: 'cci',
      canonicalOrigin: 'https://cci.fundworkspace.com',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_actor_user_id: 'user-1',
      p_name: 'CCI',
      p_slug: 'cci',
      p_claude_api_key_encrypted: null,
      p_postmark_webhook_token_encrypted: null,
    })
    expect(rpc.mock.calls[0][1].p_encryption_key_encrypted).not.toContain('11'.repeat(32))
  })
})

describe('Fund member invitation capabilities', () => {
  it('normalizes only external email and bounded roles', () => {
    expect(normalizeExternalInvitationEmail(' Alice@Example.COM ')).toBe('alice@example.com')
    expect(() => normalizeExternalInvitationEmail('alice@cci.fundworkspace.com')).toThrow('external email')
    expect(normalizeFundInvitationRole('admin')).toBe('admin')
    expect(() => normalizeFundInvitationRole('owner')).toThrow('role')
  })

  it('keeps the raw high-entropy token only in the URL fragment', () => {
    const token = generateFundInvitationToken()
    const hash = hashFundInvitationToken(token)
    const link = new URL(buildFundInvitationLink('https://cci.fundworkspace.com', token))

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toContain(token)
    expect(link.pathname).toBe('/invite')
    expect(link.search).toBe('')
    expect(new URLSearchParams(link.hash.slice(1)).get('token')).toBe(token)
  })
})
