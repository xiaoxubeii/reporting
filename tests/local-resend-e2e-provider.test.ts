import { afterEach, describe, expect, it } from 'vitest'

import { startLocalResendProvider } from '../scripts/e2e/local-resend-provider.mjs'

const closeProviders: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(closeProviders.splice(0).map(close => close()))
})

describe('local E2E Resend provider', () => {
  it('accepts authenticated outbound mail and exposes it only through the control API', async () => {
    const provider = await startLocalResendProvider()
    closeProviders.push(provider.close)

    const sent = await fetch(`${provider.baseUrl}/emails`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': 'fund-message-1',
      },
      body: JSON.stringify({
        from: 'Expert <expert@alpha.fundworkspace.com>',
        to: 'doctor@example.test',
        reply_to: 'r_deadbeef@alpha.fundworkspace.com',
        subject: 'Expert invitation',
        text: 'Please reply.',
      }),
    })
    expect(sent.status).toBe(200)
    const { id } = await sent.json() as { id: string }

    const denied = await fetch(`${provider.controlUrl}/outbound/${id}`)
    expect(denied.status).toBe(401)
    const inspected = await fetch(`${provider.controlUrl}/outbound/${id}`, {
      headers: { authorization: `Bearer ${provider.controlToken}` },
    })
    expect(await inspected.json()).toMatchObject({
      id,
      idempotencyKey: 'fund-message-1',
      payload: {
        to: 'doctor@example.test',
        reply_to: 'r_deadbeef@alpha.fundworkspace.com',
      },
    })
  })

  it('registers an inbound message for the Resend receiving API without accepting malformed control data', async () => {
    const provider = await startLocalResendProvider()
    closeProviders.push(provider.close)

    const invalid = await fetch(`${provider.controlUrl}/inbound`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${provider.controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ subject: 'missing identity' }),
    })
    expect(invalid.status).toBe(400)

    const message = {
      id: 'inbound-1',
      created_at: new Date().toISOString(),
      from: 'doctor@example.test',
      to: ['r_deadbeef@alpha.fundworkspace.com'],
      cc: [],
      bcc: [],
      reply_to: [],
      message_id: '<inbound-1@example.test>',
      subject: 'Re: Expert invitation',
      text: 'Independent evidence is still required.',
      html: null,
      headers: { 'in-reply-to': '<outbound-1@alpha.fundworkspace.com>' },
      attachments: [],
    }
    const registered = await fetch(`${provider.controlUrl}/inbound`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${provider.controlToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(message),
    })
    expect(registered.status).toBe(201)

    const retrieved = await fetch(`${provider.baseUrl}/emails/receiving/inbound-1`, {
      headers: { authorization: `Bearer ${provider.apiKey}` },
    })
    expect(retrieved.status).toBe(200)
    expect(await retrieved.json()).toEqual(message)
  })
})
