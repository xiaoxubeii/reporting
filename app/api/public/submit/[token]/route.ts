import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFeatureProvider } from '@/lib/ai/feature-provider'
import { extractAttachmentText, type PostmarkPayload } from '@/lib/parsing/extractAttachmentText'
import { insertInboundDealIdempotently, processDeal } from '@/lib/pipeline/processDeal'
import {
  buildPublicSubmissionFallbackDeal,
  ensureProcessedDeal,
  queueFallbackDealResearch,
} from '@/lib/deals/public-submission-fallback'
import type { PostmarkPayload as PipelinePayload } from '@/lib/pipeline/processEmail'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { fundMatchesTrustedRequestTenant } from '@/lib/tenancy/request'
import { RequestBodyTooLargeError, readBoundedJson } from '@/lib/http/read-bounded-body'
import type { Json } from '@/lib/types/database'
import { persistPreparedSubmissionAttachments } from '@/lib/deals/submission-attachments'
import {
  attachmentFailureMessage,
  prepareLegacyInboundAttachments,
} from '@/lib/email/legacy-inbound-attachments'

import {
  MAX_NAME_LEN, MAX_EMAIL_LEN, MAX_URL_LEN, MAX_PITCH_LEN,
  EMAIL_RE, safeWebUrl, sanitizeFilename, validateAttachmentType,
} from '@/lib/deals/submission-validation'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_SUBMISSION_BODY_BYTES = 14 * 1024 * 1024
const MIN_PITCH_LEN = 50
type JsonObject = { [key: string]: Json | undefined }
type SyntheticPostmarkPayload = PostmarkPayload & {
  From: string
  To: string
  FromFull: { Email: string; Name: string }
  Subject: string
  MessageID: string
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = getClientIp(req)
  const limited = await rateLimit({ key: `public-submit:${ip}`, limit: 5, windowSeconds: 3600 })
  if (limited) return limited

  const admin = createAdminClient()

  // Resolve the token to a fund. RLS bypass via service role; the token is the auth.
  const { data: settings } = await admin
    .from('fund_settings')
    .select('fund_id, deal_intake_enabled, deal_submission_token')
    .eq('deal_submission_token', params.token)
    .maybeSingle()

  if (!settings || !(settings as { deal_intake_enabled: boolean }).deal_intake_enabled) {
    return NextResponse.json({ error: 'Submission form is not active' }, { status: 404 })
  }
  const fundId = (settings as { fund_id: string }).fund_id
  if (!(await fundMatchesTrustedRequestTenant(admin as never, req.headers, fundId))) {
    return NextResponse.json({ error: 'Submission form is not active' }, { status: 404 })
  }

  let body: {
    companyName?: string
    companyUrl?: string
    founderName?: string
    founderEmail?: string
    pitch?: string
    attachment?: { name: string; contentType: string; data: string } | null
    website?: string
  }
  try {
    body = await readBoundedJson(req, MAX_SUBMISSION_BODY_BYTES)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: 'Submission is too large' }, { status: 413 })
    }
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Honeypot — silently accept-but-discard.
  if (body.website && body.website.trim()) {
    return NextResponse.json({ ok: true })
  }

  const companyName = (body.companyName?.trim() ?? '').slice(0, MAX_NAME_LEN)
  const founderName = (body.founderName?.trim() ?? '').slice(0, MAX_NAME_LEN)
  const founderEmail = (body.founderEmail?.trim().toLowerCase() ?? '').slice(0, MAX_EMAIL_LEN)
  const pitch = (body.pitch?.trim() ?? '').slice(0, MAX_PITCH_LEN)
  const rawCompanyUrl = (body.companyUrl?.trim() ?? '').slice(0, MAX_URL_LEN)

  if (!companyName || !founderName || !founderEmail || !pitch) {
    return NextResponse.json({ error: 'Required fields missing' }, { status: 400 })
  }
  if (!EMAIL_RE.test(founderEmail)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }
  if (pitch.length < MIN_PITCH_LEN) {
    return NextResponse.json({ error: `Pitch must be at least ${MIN_PITCH_LEN} characters` }, { status: 400 })
  }

  // Validate and normalize the website URL. Reject anything that isn't
  // http(s) — `javascript:`, `data:`, `file:` etc. would otherwise be stored
  // and later rendered into an <a href>, opening a stored-XSS path.
  let companyUrl = ''
  if (rawCompanyUrl) {
    const normalized = safeWebUrl(rawCompanyUrl)
    if (!normalized) {
      return NextResponse.json({ error: 'Website URL must start with http:// or https://' }, { status: 400 })
    }
    companyUrl = normalized
  }

  // Validate attachment if present.
  let attachment: { Name: string; ContentType: string; Content: string; ContentLength: number } | null = null
  if (body.attachment && typeof body.attachment === 'object' && body.attachment.data) {
    if (typeof body.attachment.name !== 'string' || typeof body.attachment.contentType !== 'string') {
      return NextResponse.json({ error: 'Invalid attachment metadata' }, { status: 400 })
    }
    const raw = Buffer.from(body.attachment.data, 'base64')
    if (raw.length === 0 || raw.length > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Attachment too large' }, { status: 400 })
    }
    const safeName = sanitizeFilename(body.attachment.name)
    const typeErr = validateAttachmentType(safeName, body.attachment.contentType)
    if (typeErr) return NextResponse.json({ error: typeErr.message }, { status: 400 })
    attachment = {
      Name: safeName,
      ContentType: body.attachment.contentType,
      Content: body.attachment.data,
      ContentLength: raw.length,
    }
  }

  // Build a synthetic Postmark-shaped payload so the rest of the pipeline can
  // consume it without special-casing public submissions.
  const subject = `Web submission: ${companyName}`
  const composedBody = [
    `Founder: ${founderName} <${founderEmail}>`,
    companyUrl ? `Website: ${companyUrl}` : null,
    '',
    pitch,
  ].filter(Boolean).join('\n')

  const messageId = `<public-submit-${crypto.randomUUID()}@hemrock.local>`

  const payload: SyntheticPostmarkPayload = {
    From: founderEmail,
    To: 'public-submit@hemrock.local',
    FromFull: { Email: founderEmail, Name: founderName },
    Subject: subject,
    TextBody: composedBody,
    HtmlBody: '',
    MessageID: messageId,
    Attachments: attachment ? [attachment] : [],
  }

  // Decode and scan the complete attachment set before creating any database
  // or storage records. This also covers ZIP integrity and expansion limits.
  const preparedAttachments = await prepareLegacyInboundAttachments(payload.Attachments ?? [])
  if (!preparedAttachments.ok) {
    const error = preparedAttachments.code === 'attachment_unsafe'
      ? 'Attachment failed security scan'
      : attachmentFailureMessage(preparedAttachments.code)
    return NextResponse.json({ error }, { status: 400 })
  }

  // Insert inbound_emails row first so processDeal can FK to it.
  const { data: emailInsert, error: emailErr } = await admin
    .from('inbound_emails')
    .insert({
      fund_id: fundId,
      from_address: founderEmail,
      subject,
      received_at: new Date().toISOString(),
      raw_payload: stripAttachmentContent(payload),
      processing_status: 'processing',
      attachments_count: attachment ? 1 : 0,
      routing_label: 'deals',
      routing_confidence: 1.0,
      routing_reasoning: 'Public submission form (bypassed classifier)',
      routing_secondary_label: null,
      routed_to: 'deals',
    })
    .select('id')
    .single()

  if (emailErr || !emailInsert) {
    console.error('[public-submit] inbound_emails insert failed:', emailErr)
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 })
  }

  const emailId = (emailInsert as { id: string }).id

  // Store every attachment and publish StoragePath metadata atomically. A
  // partial upload or failed metadata write is rolled back and fails closed.
  const storedAttachments = await persistPreparedSubmissionAttachments(
    preparedAttachments.attachments,
    {
      store: async ({ filename, contentType, bytes }) => {
        const storagePath = `${emailId}/${filename}`
        const { error } = await admin.storage
          .from('email-attachments')
          .upload(storagePath, bytes, { contentType, upsert: true })
        if (error) throw error
        return storagePath
      },
      remove: async storagePath => {
        const { error } = await admin.storage
          .from('email-attachments')
          .remove([storagePath])
        if (error) throw error
      },
      persistMetadata: async stored => {
        const stripped = { ...stripAttachmentContent(payload), Attachments: stored }
        const { error } = await admin
          .from('inbound_emails')
          .update({ raw_payload: stripped as unknown as Json })
          .eq('id', emailId)
        if (error) throw error
      },
    },
  )
  if (!storedAttachments.ok) {
    const storageFailure = attachmentFailureMessage('attachment_storage_failed')
    await admin
      .from('inbound_emails')
      .update({ processing_status: 'failed', processing_error: storageFailure })
      .eq('id', emailId)
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 })
  }

  const insertFallbackDeal = () => insertInboundDealIdempotently(
    admin,
    buildPublicSubmissionFallbackDeal({
      emailId,
      fundId,
      companyName,
      companyUrl,
      founderName,
      founderEmail,
      pitch,
    }),
  )

  // Run the deals pipeline. Both thrown failures and a resolved null Deal id
  // must persist a fallback before the public endpoint can acknowledge intake.
  let processResult: { dealId?: string | null } | null = null
  let analysisError: string | null = null
  try {
    const { provider, model, providerType } = await getFeatureProvider(admin, fundId, 'deal_analysis')
    const extracted = await extractAttachmentText(payload)
    processResult = await processDeal({
      supabase: admin,
      emailId,
      fundId,
      payload: payload as PipelinePayload,
      extracted,
      provider,
      providerType,
      model,
    })
  } catch (err) {
    analysisError = err instanceof Error ? err.message : 'Unknown error'
    console.error('[public-submit] processDeal failed:', analysisError)
  }

  let ensuredDeal
  try {
    ensuredDeal = await ensureProcessedDeal(processResult, insertFallbackDeal)
  } catch (err) {
    const fallbackError = err instanceof Error ? err.message : 'Fallback Deal insert failed'
    console.error('[public-submit] Fallback Deal insert failed:', fallbackError)
    await admin
      .from('inbound_emails')
      .update({
        processing_status: 'failed',
        processing_error: analysisError ?? fallbackError,
      })
      .eq('id', emailId)
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 })
  }

  if (analysisError || ensuredDeal.usedFallback) {
    try {
      await queueFallbackDealResearch({ dealId: ensuredDeal.dealId, fundId })
    } catch (error) {
      console.error('[public-submit] Could not queue fallback Deal Research:', error instanceof Error ? error.message : 'Unknown error')
    }
    await admin
      .from('inbound_emails')
      .update({
        processing_status: 'failed',
        processing_error: analysisError ?? 'Deal analysis returned no Deal',
      })
      .eq('id', emailId)
  } else {
    await admin
      .from('inbound_emails')
      .update({ processing_status: 'success', processing_error: null })
      .eq('id', emailId)
  }

  return NextResponse.json({ ok: true })
}

function stripAttachmentContent(payload: SyntheticPostmarkPayload): JsonObject {
  return {
    From: payload.From,
    To: payload.To,
    FromFull: payload.FromFull,
    Subject: payload.Subject,
    TextBody: payload.TextBody,
    HtmlBody: payload.HtmlBody,
    MessageID: payload.MessageID,
    Attachments: (payload.Attachments ?? []).map(({ Name, ContentType, ContentLength, StoragePath }) => ({
      Name,
      ContentType,
      ContentLength,
      ...(StoragePath ? { StoragePath } : {}),
    })),
  }
}
