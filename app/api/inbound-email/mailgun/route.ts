import { NextRequest, NextResponse } from 'next/server'
import { admitsRegisteredSystemRequest } from '@/lib/tenancy/system-request'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyMailgunWebhook } from '@/lib/mailgun/verify'
import { normalizeMailgunPayload, toPostmarkPayload } from '@/lib/pipeline/normalizePayload'
import { runPipeline } from '@/lib/pipeline/processEmail'
import { checkFundMember } from '@/lib/pipeline/checkFundMember'
import { isAuthorizedSender } from '@/lib/pipeline/isAuthorizedSender'
import { decrypt } from '@/lib/crypto'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { emailFingerprint } from '@/lib/pipeline/emailFingerprint'
import type { Json } from '@/lib/types/database'
import {
  attachmentFailureMessage,
  persistLegacyInboundAttachments,
  prepareLegacyInboundAttachments,
} from '@/lib/email/legacy-inbound-attachments'
import { readBoundedFormData } from '@/lib/http/read-bounded-body'

const MAX_MAILGUN_BODY_BYTES = 32 * 1024 * 1024

export async function POST(req: NextRequest) {
  if (!admitsRegisteredSystemRequest(req)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // Rate limit inbound webhook: 60 per minute per IP
  const limited = await rateLimit({ key: `inbound-mailgun:${getClientIp(req)}`, limit: 60, windowSeconds: 60 })
  if (limited) return limited

  try {
    await handleMailgunInbound(req)
  } catch (err) {
    console.error('[inbound-email/mailgun] Unhandled error:', err)
  }
  // Always return 200 so Mailgun doesn't retry
  return NextResponse.json({ ok: true })
}

async function handleMailgunInbound(req: NextRequest) {
  // Mailgun sends inbound emails as multipart/form-data
  const formData = await readBoundedFormData(req, MAX_MAILGUN_BODY_BYTES)
  const supabase = createAdminClient()
  const fields: Record<string, string> = {}
  const attachments: Array<{ filename: string; contentType: string; content: Buffer }> = []

  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value
    }
  })

  // Process file attachments separately
  const attachmentEntries = Array.from(formData.entries()).filter(
    (entry): entry is [string, File] => entry[1] instanceof File
  )
  for (const [, file] of attachmentEntries) {
    const buffer = Buffer.from(await file.arrayBuffer())
    attachments.push({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      content: buffer,
    })
  }

  // Extract sender and recipient
  const fromAddress = extractEmail(fields.from || fields.sender || '')
  const recipient = fields.recipient || ''

  if (!fromAddress || !recipient) {
    console.warn('[inbound-email/mailgun] Missing from or recipient')
    return
  }

  // Resolve which fund this email belongs to by matching the Mailgun inbound domain
  const { data: allSettings } = await supabase
    .from('fund_settings')
    .select('fund_id, mailgun_inbound_domain, mailgun_signing_key_encrypted, encryption_key_encrypted')
    .eq('inbound_email_provider', 'mailgun')
    .not('mailgun_inbound_domain', 'is', null)

  if (!allSettings || allSettings.length === 0) {
    console.warn('[inbound-email/mailgun] No funds configured for Mailgun inbound')
    return
  }

  // Match fund by recipient domain
  const recipientDomain = recipient.split('@')[1]?.toLowerCase()
  const fundSettings = allSettings.find(s =>
    s.mailgun_inbound_domain?.toLowerCase() === recipientDomain
  )

  if (!fundSettings) {
    console.warn(`[inbound-email/mailgun] No fund matches domain ${recipientDomain}`)
    return
  }

  const fundId = fundSettings.fund_id

  // Verify webhook signature
  if (fundSettings.mailgun_signing_key_encrypted && fundSettings.encryption_key_encrypted) {
    const kek = process.env.ENCRYPTION_KEY
    if (!kek) {
      console.error('[inbound-email/mailgun] ENCRYPTION_KEY not set, rejecting request')
      return
    }
    const dek = decrypt(fundSettings.encryption_key_encrypted, kek)
    const signingKey = decrypt(fundSettings.mailgun_signing_key_encrypted, dek)

    const timestamp = fields.timestamp || ''
    const token = fields.token || ''
    const signature = fields.signature || ''

    if (!verifyMailgunWebhook(signingKey, timestamp, token, signature)) {
      console.warn('[inbound-email/mailgun] Invalid webhook signature')
      return
    }
  } else {
    console.warn('[inbound-email/mailgun] Rejecting, no signing key configured for this fund')
    return
  }

  // Check if sender is a fund member (determines interaction extraction, bypasses authorized_senders)
  const fundMember = await checkFundMember(supabase, fundId, fromAddress)

  // Check authorized senders (fund members bypass this check)
  if (!fundMember) {
    const authorized = await isAuthorizedSender(supabase, fundId, fromAddress)
    if (!authorized) {
      console.warn(`[inbound-email/mailgun] Unauthorized sender ${fromAddress} for fund ${fundId}`)
      return
    }
  }

  // Normalize to PostmarkPayload format for the unified pipeline
  const normalized = normalizeMailgunPayload(fields, attachments)
  const payload = toPostmarkPayload(normalized)

  // Check for duplicate emails (same sender + subject + date)
  const fingerprint = emailFingerprint(
    fromAddress,
    fields.subject ?? null,
    fields.Date ?? fields.date ?? null,
    fields['Message-Id'] ?? fields['message-id'] ?? null
  )

  const { data: existingEmail } = await supabase
    .from('inbound_emails')
    .select('id')
    .eq('fund_id', fundId)
    .eq('email_fingerprint', fingerprint)
    .maybeSingle()

  if (existingEmail) {
    console.log(`[inbound-email/mailgun] Duplicate email detected (fingerprint=${fingerprint}), skipping`)
    return
  }

  // Build a storage-friendly payload (strip Content from attachments)
  const strippedPayload = { ...payload }
  if (payload.Attachments && payload.Attachments.length > 0) {
    strippedPayload.Attachments = payload.Attachments.map(att => ({
      Name: att.Name,
      ContentType: att.ContentType,
      ContentLength: att.ContentLength,
    }))
  }

  const preparedAttachments = await prepareLegacyInboundAttachments(payload.Attachments ?? [])
  const attachmentError = preparedAttachments.ok
    ? null
    : attachmentFailureMessage(preparedAttachments.code)

  // Persist raw email (without attachment content)
  const { data: emailRow, error: insertError } = await supabase
    .from('inbound_emails')
    .insert({
      fund_id: fundId,
      from_address: fromAddress,
      subject: fields.subject ?? null,
      raw_payload: strippedPayload as unknown as Json,
      processing_status: attachmentError ? 'failed' : 'pending',
      processing_error: attachmentError,
      attachments_count: attachments.length,
      email_fingerprint: fingerprint,
    })
    .select('id')
    .single()

  if (insertError || !emailRow) {
    console.error('[inbound-email/mailgun] Failed to insert email record:', insertError)
    return
  }

  const emailId = emailRow.id

  if (!preparedAttachments.ok) {
    console.warn(`[inbound-email/mailgun] ${preparedAttachments.code}; refusing pipeline processing`)
    return
  }

  // Store the complete safe set or roll back. Never retain base64 in the row,
  // and never invoke the pipeline after a partial storage failure.
  const storedAttachments = await persistLegacyInboundAttachments(
    preparedAttachments.attachments,
    {
      store: async ({ filename, contentType, bytes }) => {
        const storagePath = `${emailId}/${filename}`
        const { error } = await supabase.storage
          .from('email-attachments')
          .upload(storagePath, bytes, { contentType })
        if (error) throw error
        return storagePath
      },
      remove: async storagePath => {
        const { error } = await supabase.storage
          .from('email-attachments')
          .remove([storagePath])
        if (error) throw error
      },
    },
  )
  if (!storedAttachments.ok) {
    await supabase
      .from('inbound_emails')
      .update({
        processing_status: 'failed',
        processing_error: attachmentFailureMessage(storedAttachments.code),
      })
      .eq('id', emailId)
    return
  }

  if (storedAttachments.attachments.length > 0) {
    const { error: metadataError } = await supabase
      .from('inbound_emails')
      .update({
        raw_payload: {
          ...strippedPayload,
          Attachments: storedAttachments.attachments,
        } as unknown as Json,
      })
      .eq('id', emailId)
    if (metadataError) {
      await Promise.allSettled(storedAttachments.attachments.map(async attachment => {
        await supabase.storage.from('email-attachments').remove([attachment.StoragePath])
      }))
      await supabase
        .from('inbound_emails')
        .update({
          processing_status: 'failed',
          processing_error: attachmentFailureMessage('attachment_storage_failed'),
        })
        .eq('id', emailId)
      return
    }
  }

  try {
    await supabase
      .from('inbound_emails')
      .update({ processing_status: 'processing' })
      .eq('id', emailId)

    // Pass original in-memory payload (with Content) to avoid extra Storage download
    await runPipeline(supabase, emailId, fundId, payload, fundMember ? { userId: fundMember.user_id } : null)
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    console.error(`[inbound-email/mailgun] Pipeline error for email ${emailId}:`, err)
    const message = describePipelineError(raw)
    await supabase
      .from('inbound_emails')
      .update({ processing_status: 'failed', processing_error: message })
      .eq('id', emailId)
  }
}

function describePipelineError(raw: string): string {
  if (raw.includes('API key not configured')) {
    const provider = raw.includes('OpenAI') ? 'OpenAI' : raw.includes('Gemini') ? 'Gemini' : 'AI'
    return `${provider} API key not configured. Add it in Settings to process emails.`
  }
  if (raw.includes('Failed to refresh Google token') || raw.includes('invalid_grant')) {
    return 'Google Drive connection expired. Reconnect in Settings > Google credentials, then reprocess this email.'
  }
  if (raw.includes('rate limit') || raw.includes('429')) {
    return 'AI provider rate limit reached. Wait a few minutes and reprocess this email.'
  }
  if (raw.includes('timeout') || raw.includes('ETIMEDOUT') || raw.includes('ECONNREFUSED')) {
    return 'Connection to AI provider timed out. Check your API key and try reprocessing.'
  }
  return raw
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match ? match[1] : from.trim()
}
