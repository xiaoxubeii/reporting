import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'

const enabled = process.env.RESEND_EMAIL_INTEGRATION === 'true'
if (enabled) loadIntegrationEnvironment()

const created = {
  userIds: [] as string[],
  fundIds: [] as string[],
}

describe.runIf(enabled)('multi-tenant Resend persistence integration', () => {
  it('isolates same-name mailboxes and rejects cross-Fund relationships', async () => {
    const admin = createAdminClient()
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const users = await Promise.all([
      admin.auth.admin.createUser({
        email: `mail-a-${suffix}@example.invalid`,
        password: `Integration-${randomUUID()}!`,
        email_confirm: true,
      }),
      admin.auth.admin.createUser({
        email: `mail-b-${suffix}@example.invalid`,
        password: `Integration-${randomUUID()}!`,
        email_confirm: true,
      }),
    ])
    for (const result of users) {
      if (result.error || !result.data.user) throw new Error('Unable to create email integration user')
      created.userIds.push(result.data.user.id)
    }

    const fundRows = await Promise.all(
      created.userIds.map((userId, index) =>
        admin
          .from('funds')
          .insert({
            name: `Email integration ${index} ${suffix}`,
            created_by: userId,
            email_subdomain: `mail-${index}-${suffix}`,
          })
          .select('id')
          .single(),
      ),
    )
    for (const result of fundRows) {
      if (result.error || !result.data) throw new Error('Unable to create email integration Fund')
      created.fundIds.push(result.data.id)
    }

    const mailboxRows = await Promise.all(
      created.fundIds.map((fundId, index) =>
        admin
          .from('fund_email_mailboxes')
          .insert({
            fund_id: fundId,
            local_part: 'alice',
            kind: 'user',
            user_id: created.userIds[index],
            display_name: 'Alice',
          })
          .select('id, fund_id, local_part')
          .single(),
      ),
    )
    expect(mailboxRows.every((result) => !result.error && result.data?.local_part === 'alice')).toBe(true)
    const otherFundMailbox = mailboxRows[1]?.data
    if (!otherFundMailbox) throw new Error('Unable to create cross-Fund mailbox fixture')

    const crossFundThread = await admin.from('fund_email_threads').insert({
      fund_id: created.fundIds[0],
      mailbox_id: otherFundMailbox.id,
      purpose: 'general',
      subject: 'Must fail',
    })
    expect(crossFundThread.error?.code).toBe('23503')
  })

  it('fences concurrent delivery, retries failure, and deduplicates provider email IDs', async () => {
    const admin = createAdminClient()
    const fundId = created.fundIds[0]
    const routeToken = randomUUID() + randomUUID()
    const routeTokenHash = sha256(routeToken)
    const connection = await admin
      .from('fund_email_provider_credentials')
      .insert({
        fund_id: fundId,
        domain: `mail-0-${createdSuffix()}-invalid.example`,
        sending_api_key_encrypted: 'encrypted:sending',
        receiving_api_key_encrypted: 'encrypted:receiving',
        webhook_secret_encrypted: 'encrypted:webhook',
        route_token_hash: routeTokenHash,
        domain_status: 'verified',
        receiving_status: 'verified',
      })
      .select('id')
      .single()
    if (connection.error || !connection.data) {
      // The exact domain is not used by this persistence test, but it must remain unique.
      const retry = await admin
        .from('fund_email_provider_credentials')
        .insert({
          fund_id: fundId,
          domain: `mail-${randomUUID().slice(0, 12)}.example.invalid`,
          sending_api_key_encrypted: 'encrypted:sending',
          receiving_api_key_encrypted: 'encrypted:receiving',
          webhook_secret_encrypted: 'encrypted:webhook',
          route_token_hash: routeTokenHash,
          domain_status: 'verified',
          receiving_status: 'verified',
        })
        .select('id')
        .single()
      if (retry.error || !retry.data) throw new Error('Unable to create email integration connection')
    }

    const args = {
      p_route_token_hash: routeTokenHash,
      p_svix_id: `msg_${randomUUID()}`,
      p_provider_email_id: `email_${randomUUID()}`,
      p_lease_seconds: 60,
    }
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => admin.rpc('fund_email_claim_webhook_event', args)),
    )
    expect(claims.filter((result) => result.data?.id).length).toBe(1)
    expect(claims.every((result) => !result.error)).toBe(true)

    const claimed = claims.find((result) => result.data?.id)?.data
    expect(claimed).toBeTruthy()
    if (!claimed) throw new Error('Unable to claim webhook event fixture')
    const failed = await admin.rpc('fund_email_fail_webhook_event', {
      p_event_id: claimed.id,
      p_attempt_id: claimed.attempt_id,
      p_error_code: 'content_retrieval_failed',
    })
    expect(failed.error).toBeNull()
    expect(failed.data).toBe(true)

    const retry = await admin.rpc('fund_email_claim_webhook_event', args)
    expect(retry.error).toBeNull()
    if (!retry.data) throw new Error('Unable to reclaim webhook event fixture')
    expect(retry.data?.id).toBe(claimed.id)
    expect(retry.data?.attempt_id).not.toBe(claimed.attempt_id)

    const completed = await admin.rpc('fund_email_complete_webhook_event', {
      p_event_id: retry.data.id,
      p_attempt_id: retry.data.attempt_id,
      p_disposition: 'routed',
    })
    expect(completed.data).toBe(true)

    const duplicateProviderEmail = await admin.rpc('fund_email_claim_webhook_event', {
      ...args,
      p_svix_id: `msg_${randomUUID()}`,
    })
    expect(duplicateProviderEmail.error).toBeNull()
    // PostgREST may project a composite PostgreSQL NULL as either JSON null or
    // an object whose fields are all null. In both representations, no event
    // identity is returned and no second delivery can be processed.
    expect(duplicateProviderEmail.data?.id ?? null).toBeNull()
  })

  it('prepares one durable outbound message, rejects semantic reuse, and verifies sending after submit', async () => {
    const admin = createAdminClient()
    const fundId = created.fundIds[0]
    const [mailboxResult, connectionResult] = await Promise.all([
      admin
        .from('fund_email_mailboxes')
        .select('id')
        .eq('fund_id', fundId)
        .eq('local_part', 'alice')
        .single(),
      admin
        .from('fund_email_provider_credentials')
        .select('id, domain, sending_status')
        .eq('fund_id', fundId)
        .single(),
    ])
    if (mailboxResult.error || !mailboxResult.data) throw new Error('Missing outbound mailbox fixture')
    if (connectionResult.error || !connectionResult.data) throw new Error('Missing outbound connection fixture')
    expect(connectionResult.data.sending_status).toBe('pending')

    const idempotencyKey = `fund-email:${sha256(randomUUID()).slice(0, 48)}`
    const messageId = `<integration.${sha256(idempotencyKey).slice(0, 32)}@${connectionResult.data.domain}>`
    const args = {
      p_fund_id: fundId,
      p_mailbox_id: mailboxResult.data.id,
      p_purpose: 'general',
      p_context_type: null,
      p_context_id: null,
      p_external_participant_address: 'recipient@example.invalid',
      p_subject: 'Integration outbound',
      p_from_address: `Alice <alice@${connectionResult.data.domain}>`,
      p_to_addresses: ['recipient@example.invalid'],
      p_cc_addresses: [],
      p_bcc_addresses: [],
      p_text_body: 'Plain body',
      p_html_body_untrusted: '<p>Plain body</p>',
      p_internet_message_id: messageId,
      p_reply_token_hash: sha256(`reply:${idempotencyKey}`),
      p_idempotency_key: idempotencyKey,
    }

    const prepared = await admin.rpc('fund_email_prepare_outbound_message', args)
    expect(prepared.error).toBeNull()
    const first = prepared.data?.[0]
    if (!first) throw new Error('Outbound message was not prepared')
    expect(first.internet_message_id).toBe(messageId)

    const replay = await admin.rpc('fund_email_prepare_outbound_message', args)
    expect(replay.error).toBeNull()
    expect(replay.data?.[0]?.message_id).toBe(first.message_id)

    const conflict = await admin.rpc('fund_email_prepare_outbound_message', {
      ...args,
      p_subject: 'Changed semantic payload',
    })
    expect(conflict.error?.code).toBe('22023')

    const submitted = await admin.rpc('fund_email_mark_outbound_submitted', {
      p_fund_id: fundId,
      p_connection_id: connectionResult.data.id,
      p_message_id: first.message_id,
      p_provider_message_id: `resend_${randomUUID()}`,
    })
    expect(submitted.error).toBeNull()
    expect(submitted.data).toBe(true)

    const [message, connection] = await Promise.all([
      admin
        .from('fund_email_messages')
        .select('internet_message_id, routing_status, provider_message_id')
        .eq('id', first.message_id)
        .single(),
      admin
        .from('fund_email_provider_credentials')
        .select('sending_status')
        .eq('id', connectionResult.data.id)
        .single(),
    ])
    expect(message.data).toMatchObject({
      internet_message_id: messageId,
      routing_status: 'routed',
    })
    expect(message.data?.provider_message_id).toMatch(/^resend_/)
    expect(connection.data?.sending_status).toBe('verified')
  })
})

afterAll(async () => {
  if (!enabled) return
  const admin = createAdminClient()
  for (const fundId of [...created.fundIds].reverse()) {
    await admin.from('funds').delete().eq('id', fundId)
  }
  for (const userId of [...created.userIds].reverse()) {
    await admin.auth.admin.deleteUser(userId)
  }
})

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function createdSuffix(): string {
  return randomUUID().replaceAll('-', '').slice(0, 12)
}

function loadIntegrationEnvironment(): void {
  const allowed = new Set(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  for (const rawLine of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!allowed.has(key) || process.env[key]) continue
    process.env[key] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
}
