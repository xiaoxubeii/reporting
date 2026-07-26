import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  createResendInboundWebhook,
  recoverResendInboundWebhook,
  refreshResendInboundWebhook,
  removeResendWebhook,
} from './resend-webhooks'

const unused = {
  get: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
}

describe('Resend managed webhook adapter', () => {
  it('creates only the requested email.received endpoint and captures provider signing material', async () => {
    const create = vi.fn().mockResolvedValue({
      data: { id: 'wh_123', signing_secret: 'whsec_returned_once' },
      error: null,
    })
    const result = await createResendInboundWebhook('re_full_access', {
      endpoint: 'https://hooks.fundworkspace.com/api/inbound-email/resend/route',
      events: ['email.received'],
    }, { create, remove: vi.fn(), ...unused })

    expect(create).toHaveBeenCalledWith('re_full_access', {
      endpoint: 'https://hooks.fundworkspace.com/api/inbound-email/resend/route',
      events: ['email.received'],
    })
    expect(result).toEqual({ id: 'wh_123', signingSecret: 'whsec_returned_once' })
  })

  it('fails with a sanitized error for provider errors or malformed signing material', async () => {
    for (const response of [
      { data: null, error: { message: 'raw provider detail' } },
      { data: { id: 'wh_123' }, error: null },
    ]) {
      await expect(createResendInboundWebhook('re_full_access', {
        endpoint: 'https://hooks.fundworkspace.com/api/inbound-email/resend/route',
        events: ['email.received'],
      }, {
        create: vi.fn().mockResolvedValue(response),
        remove: vi.fn(),
        ...unused,
      })).rejects.toMatchObject({
        code: 'credential_unavailable',
        message: expect.not.stringContaining('raw provider detail'),
      })
    }
  })

  it('requires provider-confirmed deletion', async () => {
    const remove = vi.fn().mockResolvedValue({
      data: { id: 'wh_123', deleted: true },
      error: null,
    })
    await expect(removeResendWebhook('re_full_access', 'wh_123', {
      create: vi.fn(), remove, ...unused,
    })).resolves.toBeUndefined()
    expect(remove).toHaveBeenCalledWith('re_full_access', 'wh_123')
  })

  it('treats provider not-found deletion as an idempotent success', async () => {
    await expect(removeResendWebhook('re_full_access', 'wh_123', {
      create: vi.fn(),
      remove: vi.fn().mockResolvedValue({
        data: null,
        error: { name: 'not_found', statusCode: 404, message: 'raw detail' },
      }),
      ...unused,
    })).resolves.toBeUndefined()
  })

  it('updates an existing endpoint in place and retrieves its signing secret', async () => {
    const routeToken = 'R'.repeat(43)
    const currentEndpoint = `https://old-tunnel.example/api/inbound-email/resend/${routeToken}`
    const endpoint = `https://hooks.fundworkspace.com/api/inbound-email/resend/${routeToken}`
    const routeHash = createHash('sha256').update(routeToken).digest('hex')
    const get = vi.fn()
      .mockResolvedValueOnce({
        data: {
          id: 'wh_123', endpoint: currentEndpoint, signing_secret: 'whsec_existing',
          status: 'enabled', events: ['email.received'],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'wh_123', endpoint, signing_secret: 'whsec_existing',
          status: 'enabled', events: ['email.received'],
        },
        error: null,
      })
    const update = vi.fn().mockResolvedValue({ data: { id: 'wh_123' }, error: null })

    await expect(refreshResendInboundWebhook(
      're_full_access', 'wh_123', routeHash, 'https://hooks.fundworkspace.com',
      { create: vi.fn(), remove: vi.fn(), get, update, list: vi.fn() },
    )).resolves.toEqual({
      id: 'wh_123', signingSecret: 'whsec_existing', routeToken,
    })
    expect(update).toHaveBeenCalledWith('re_full_access', 'wh_123', {
      endpoint,
      events: ['email.received'],
      status: 'enabled',
    })
  })

  it('adopts a legacy endpoint by matching only its stored route-token hash', async () => {
    const routeToken = 'L'.repeat(43)
    const endpoint = `https://hooks.fundworkspace.com/api/inbound-email/resend/${routeToken}`
    const routeHash = createHash('sha256').update(routeToken).digest('hex')
    const get = vi.fn().mockResolvedValue({
      data: {
        id: 'wh_legacy', endpoint, signing_secret: 'whsec_legacy',
        status: 'enabled', events: ['email.received'],
      },
      error: null,
    })

    await expect(refreshResendInboundWebhook(
      're_full_access', null, routeHash, 'https://hooks.fundworkspace.com',
      {
        create: vi.fn(), remove: vi.fn(), get,
        list: vi.fn().mockResolvedValue({
          data: { data: [{ id: 'wh_legacy', endpoint }], has_more: false }, error: null,
        }),
        update: vi.fn().mockResolvedValue({ data: { id: 'wh_legacy' }, error: null }),
      },
    )).resolves.toEqual({
      id: 'wh_legacy', signingSecret: 'whsec_legacy', routeToken,
    })
  })

  it('recovers the sole unpersisted managed endpoint at the configured origin', async () => {
    const routeToken = 'O'.repeat(43)
    const endpoint = `https://hooks.fundworkspace.com/api/inbound-email/resend/${routeToken}`
    const get = vi.fn().mockResolvedValue({
      data: {
        id: 'wh_orphan', endpoint, signing_secret: 'whsec_orphan',
        status: 'enabled', events: ['email.received'],
      },
      error: null,
    })
    const update = vi.fn().mockResolvedValue({ data: { id: 'wh_orphan' }, error: null })

    await expect(recoverResendInboundWebhook(
      're_full_access', 'https://hooks.fundworkspace.com',
      {
        create: vi.fn(), remove: vi.fn(), get, update,
        list: vi.fn().mockResolvedValue({
          data: {
            data: [
              { id: 'wh_elsewhere', endpoint: 'https://other.example/webhook' },
              { id: 'wh_orphan', endpoint },
            ],
            has_more: false,
          },
          error: null,
        }),
      },
    )).resolves.toEqual({
      id: 'wh_orphan', signingSecret: 'whsec_orphan', routeToken,
    })
    expect(update).toHaveBeenCalledWith('re_full_access', 'wh_orphan', {
      endpoint,
      events: ['email.received'],
      status: 'enabled',
    })
  })

  it('fails closed instead of guessing when multiple managed orphan endpoints exist', async () => {
    const endpoint = (token: string) => (
      `https://hooks.fundworkspace.com/api/inbound-email/resend/${token.repeat(43)}`
    )
    await expect(recoverResendInboundWebhook(
      're_full_access', 'https://hooks.fundworkspace.com',
      {
        create: vi.fn(), remove: vi.fn(), get: vi.fn(), update: vi.fn(),
        list: vi.fn().mockResolvedValue({
          data: {
            data: [
              { id: 'wh_one', endpoint: endpoint('A') },
              { id: 'wh_two', endpoint: endpoint('B') },
            ],
            has_more: false,
          },
          error: null,
        }),
      },
    )).rejects.toMatchObject({ code: 'credential_unavailable' })
  })

  it('fails closed when the bounded provider list reports another page', async () => {
    const list = vi.fn().mockResolvedValue({
      data: { data: [], has_more: true },
      error: null,
    })
    await expect(recoverResendInboundWebhook(
      're_full_access', 'https://hooks.fundworkspace.com',
      { create: vi.fn(), remove: vi.fn(), get: vi.fn(), update: vi.fn(), list },
    )).rejects.toMatchObject({ code: 'credential_unavailable' })
    expect(list).toHaveBeenCalledWith('re_full_access', { limit: 100 })
  })

  it('does not create a second endpoint when a managed webhook cannot be retrieved', async () => {
    await expect(refreshResendInboundWebhook(
      're_full_access', 'wh_missing', 'a'.repeat(64), 'https://hooks.fundworkspace.com',
      {
        create: vi.fn(), remove: vi.fn(), list: vi.fn(), update: vi.fn(),
        get: vi.fn().mockResolvedValue({
          data: null,
          error: { name: 'not_found', statusCode: 404, message: 'missing' },
        }),
      },
    )).rejects.toMatchObject({ code: 'credential_unavailable' })
  })
})
