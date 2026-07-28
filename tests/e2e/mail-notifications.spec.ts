import { readFile } from 'node:fs/promises'
import { test, expect } from './support/observed-test'
import { signInToTenant, tenantOrigin } from './support/auth'
import { readE2EFixtureState } from './support/fixture-state'

interface CapabilityReport {
  readonly providers?: {
    readonly platformMail?: 'configured' | 'unconfigured'
    readonly platformMailDelivery?: 'enabled' | 'disabled'
  }
}

interface PostmarkPayload {
  readonly From: string
  readonly FromFull: { readonly Email: string; readonly Name: string }
  readonly To: string
  readonly OriginalRecipient: string
  readonly Subject: string
  readonly MessageID: string
  readonly Date: string
  readonly TextBody: string
  readonly HtmlBody: string
  readonly Attachments: readonly {
    readonly Name: string
    readonly ContentType: string
    readonly ContentLength: number
    readonly Content: string
  }[]
}

function inboundPayload(input: {
  readonly email: string
  readonly recipient: string
  readonly subject: string
  readonly suffix: string
  readonly attachment?: PostmarkPayload['Attachments'][number]
}): PostmarkPayload {
  return {
    From: input.email,
    FromFull: { Email: input.email, Name: 'E2E Fund Member' },
    To: input.recipient,
    OriginalRecipient: input.recipient,
    Subject: input.subject,
    MessageID: `<${input.suffix}@e2e.localhost>`,
    Date: new Date().toISOString(),
    TextBody: 'A uniquely tagged inbound message for durable thread and notification verification.',
    HtmlBody: '<p>A uniquely tagged inbound message for durable thread and notification verification.</p>',
    Attachments: input.attachment ? [input.attachment] : [],
  }
}

test('notification preferences persist and signed inbound mail is durable, idempotent, isolated, and fails closed', async ({ page, request, baseURL }) => {
  test.setTimeout(120_000)
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const primary = await readE2EFixtureState('E2E_PRIMARY_FIXTURE_STATE')
  const secondary = await readE2EFixtureState('E2E_SECONDARY_FIXTURE_STATE')
  // The full investment journey deliberately rotates the primary Fund to a
  // Resend receiving identity. Use the independent secondary Fund here so
  // this legacy signed-ingress contract never depends on test order.
  const mailFund = secondary
  const deniedHostFund = primary
  const origin = await signInToTenant(page, baseURL, mailFund)
  const platformOrigin = new URL(baseURL).origin

  await page.goto(`${origin}/settings/personal`)
  const allNotes = page.getByRole('radio', { name: /All notes/i })
  const preferenceResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname === '/api/settings/notifications'
    && response.request().method() === 'PATCH'
  ))
  await allNotes.check()
  expect((await preferenceResponse).status()).toBe(200)
  await expect(page.getByText('Saved', { exact: true }).last()).toBeVisible()
  await page.reload()
  await expect(page.getByRole('radio', { name: /All notes/i })).toBeChecked()

  const subject = `Signed inbound ${mailFund.suffix}`
  const payload = inboundPayload({
    email: mailFund.email,
    recipient: mailFund.inboundAddress,
    subject,
    suffix: mailFund.suffix,
  })
  const deliver = () => request.post(`${platformOrigin}/api/inbound-email`, {
    headers: { Authorization: `Bearer ${mailFund.inboundToken}` },
    data: payload,
  })
  expect((await deliver()).status()).toBe(200)
  expect((await deliver()).status()).toBe(200)

  await page.goto(`${origin}/emails`)
  await expect(page.getByText(subject, { exact: true })).toHaveCount(1)

  const deniedSubject = `Rejected inbound ${mailFund.suffix}`
  const denied = await request.post(`${platformOrigin}/api/inbound-email`, {
    headers: { Authorization: 'Bearer invalid-e2e-token' },
    data: inboundPayload({
      email: mailFund.email,
      recipient: mailFund.inboundAddress,
      subject: deniedSubject,
      suffix: `denied-${mailFund.suffix}`,
    }),
  })
  expect(denied.status()).toBe(200)
  await page.reload()
  await expect(page.getByText(deniedSubject, { exact: true })).toHaveCount(0)

  const tenantWebhook = await request.post(`${tenantOrigin(baseURL, deniedHostFund)}/api/inbound-email`, {
    headers: { Authorization: `Bearer ${mailFund.inboundToken}` },
    data: payload,
  })
  expect(tenantWebhook.status()).toBe(404)
  expect(await tenantWebhook.text()).not.toContain(mailFund.fundName)

  const unsafeBytes = Buffer.from('MZ unsafe executable fixture')
  const unsafeSubject = `Unsafe attachment ${mailFund.suffix}`
  const unsafe = await request.post(`${platformOrigin}/api/inbound-email`, {
    headers: { Authorization: `Bearer ${mailFund.inboundToken}` },
    data: inboundPayload({
      email: mailFund.email,
      recipient: mailFund.inboundAddress,
      subject: unsafeSubject,
      suffix: `unsafe-${mailFund.suffix}`,
      attachment: {
        Name: 'investment.exe',
        ContentType: 'application/octet-stream',
        ContentLength: unsafeBytes.length,
        Content: unsafeBytes.toString('base64'),
      },
    }),
  })
  expect(unsafe.status()).toBe(200)
  await page.reload()
  const unsafeRow = page.getByText(unsafeSubject, { exact: true })
  await expect(unsafeRow).toBeVisible()
  await unsafeRow.locator('xpath=ancestor::tr').click()
  await expect(page.getByText('An unsafe attachment was rejected; email was not processed.')).toBeVisible()
})

test('the public Contact form sends only with explicit E2E delivery opt-in and otherwise exercises a no-delivery boundary', async ({ page, request, baseURL }) => {
  if (!baseURL) throw new Error('Playwright baseURL is required')
  const capabilityFile = process.env.E2E_CAPABILITIES_FILE
  if (!capabilityFile) throw new Error('E2E_CAPABILITIES_FILE is required')
  const capabilities = JSON.parse(await readFile(capabilityFile, 'utf8')) as CapabilityReport
  const marker = `Platform mail ${Date.now()}`
  const platformOrigin = new URL(baseURL).origin
  const marketingEnabled = process.env.NEXT_PUBLIC_ENABLE_MARKETING_SITE === 'true'
    && Boolean(process.env.MARKETING_DEPLOYMENT_KEY)

  const deliveryEnabled = capabilities.providers?.platformMail === 'configured'
    && capabilities.providers?.platformMailDelivery === 'enabled'

  if (deliveryEnabled && marketingEnabled) {
    await page.goto(`${platformOrigin}/contact`)
    await page.getByLabel('Name').fill(marker)
    await page.getByLabel('Email').fill('reporting-e2e@example.invalid')
    await page.getByLabel('Message').fill('Real configured platform-mail delivery check from the comprehensive E2E suite.')
    await page.waitForTimeout(2_100)
    const sent = page.waitForResponse(response => (
      new URL(response.url()).pathname === '/api/contact'
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Send message' }).click()
    expect((await sent).status()).toBe(200)
    await expect(page.getByText('Thanks for reaching out! I’ll get back to you soon.')).toBeVisible()
    return
  }

  if (!deliveryEnabled && capabilities.providers?.platformMail === 'configured') {
    const noDelivery = await request.post(`${platformOrigin}/api/contact`, {
      data: {
        name: marker,
        email: 'reporting-e2e@example.invalid',
        message: 'Safe no-delivery boundary: the honeypot must discard this request before provider invocation.',
        website: 'e2e-no-delivery',
        t: Date.now() - 3_000,
      },
    })
    expect(noDelivery.status()).toBe(200)
    await expect(noDelivery.json()).resolves.toEqual({ ok: true })
    return
  }

  const direct = await request.post(`${platformOrigin}/api/contact`, {
    data: {
      name: marker,
      email: 'reporting-e2e@example.invalid',
      message: 'Explicit unconfigured mail-provider boundary.',
      website: '',
      t: Date.now() - 3_000,
    },
  })
  if (deliveryEnabled) {
    expect(direct.status()).toBe(200)
    await expect(direct.json()).resolves.toEqual({ ok: true })
  } else {
    expect(direct.status()).toBe(500)
    await expect(direct.json()).resolves.toEqual({ error: 'Failed to send message' })
  }
})
