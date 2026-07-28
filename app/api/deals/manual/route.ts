import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFeatureProvider } from '@/lib/ai/feature-provider'
import { extractAttachmentText, type PostmarkPayload } from '@/lib/parsing/extractAttachmentText'
import { insertInboundDealIdempotently, processDeal } from '@/lib/pipeline/processDeal'
import {
  buildPublicSubmissionFallbackDeal,
  ensureProcessedDeal,
  queueFallbackDealResearch,
} from '@/lib/deals/public-submission-fallback'
import { persistPreparedSubmissionAttachments } from '@/lib/deals/submission-attachments'
import {
  attachmentFailureMessage,
  prepareLegacyInboundAttachments,
} from '@/lib/email/legacy-inbound-attachments'
import type { IntroSource, Json } from '@/lib/types/database'
import type { PostmarkPayload as PipelinePayload } from '@/lib/pipeline/processEmail'
import {
  RequestBodyTooLargeError,
  readBoundedFormData,
} from '@/lib/http/read-bounded-body'
import {
  MAX_NAME_LEN, MAX_EMAIL_LEN, MAX_URL_LEN, MAX_PITCH_LEN,
  EMAIL_RE, safeWebUrl, sanitizeFilename, validateAttachmentType,
} from '@/lib/deals/submission-validation'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_FILES = 10
const MAX_MANUAL_DEAL_BODY_BYTES = 32 * 1024 * 1024
type JsonObject = { [key: string]: Json | undefined }
type SyntheticPostmarkPayload = PostmarkPayload & {
  From: string
  To: string
  FromFull: { Email: string; Name: string }
  Subject: string
  MessageID: string
}
const MANUAL_INTRO_SOURCES = new Set<IntroSource>([
  'referral',
  'cold',
  'warm_intro',
  'accelerator',
  'demo_day',
  'event',
  'other',
])

/**
 * Admin-authenticated in-app deal creation. Composes a synthetic email payload
 * from form fields + optional file attachments and runs it through the same
 * processDeal pipeline that handles Postmark webhooks and the public submit
 * form. The deal lands in /deals exactly like an emailed one.
 *
 * Accepts multipart/form-data so the client can upload files directly without
 * base64-encoding on the browser side. Fields:
 *   - company_name   (required)
 *   - founder_name   (required)
 *   - founder_email  (required)
 *   - company_url    (optional)
 *   - intro_source   (optional) — referral | cold | warm_intro | accelerator | demo_day | event | other
 *   - referrer_name  (optional)
 *   - referrer_email (optional)
 *   - pitch          (required) — free-form description
 *   - files[]        (optional, repeated) — up to MAX_FILES, each up to MAX_FILE_BYTES
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('fund_members')
    .select('fund_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'No fund found' }, { status: 403 })
  const fundId = (membership as { fund_id: string }).fund_id

  let form: FormData
  try {
    form = await readBoundedFormData(req, MAX_MANUAL_DEAL_BODY_BYTES)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: 'Submission exceeds the 32MB request limit' }, { status: 413 })
    }
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const companyName = String(form.get('company_name') ?? '').trim().slice(0, MAX_NAME_LEN)
  const founderName = String(form.get('founder_name') ?? '').trim().slice(0, MAX_NAME_LEN)
  const founderEmail = String(form.get('founder_email') ?? '').trim().toLowerCase().slice(0, MAX_EMAIL_LEN)
  const rawCompanyUrl = String(form.get('company_url') ?? '').trim().slice(0, MAX_URL_LEN)
  const introSource = String(form.get('intro_source') ?? '').trim().slice(0, MAX_NAME_LEN)
  const referrerName = String(form.get('referrer_name') ?? '').trim().slice(0, MAX_NAME_LEN)
  const referrerEmail = String(form.get('referrer_email') ?? '').trim().slice(0, MAX_EMAIL_LEN)
  const pitch = String(form.get('pitch') ?? '').trim().slice(0, MAX_PITCH_LEN)

  if (!companyName || !founderName || !founderEmail || !pitch) {
    return NextResponse.json({ error: 'company_name, founder_name, founder_email, and pitch are required' }, { status: 400 })
  }
  if (!EMAIL_RE.test(founderEmail)) {
    return NextResponse.json({ error: 'Invalid founder email' }, { status: 400 })
  }
  if (referrerEmail && !EMAIL_RE.test(referrerEmail)) {
    return NextResponse.json({ error: 'Invalid referrer email' }, { status: 400 })
  }
  if (introSource && !MANUAL_INTRO_SOURCES.has(introSource as IntroSource)) {
    return NextResponse.json({ error: 'Invalid intro source' }, { status: 400 })
  }
  const validatedIntroSource = introSource ? introSource as IntroSource : null

  // Validate and normalize the website URL — only http(s) accepted so we
  // don't store `javascript:` URLs that would later render as <a href>.
  let companyUrl = ''
  if (rawCompanyUrl) {
    const normalized = safeWebUrl(rawCompanyUrl)
    if (!normalized) {
      return NextResponse.json({ error: 'company_url must be a valid http(s) URL' }, { status: 400 })
    }
    companyUrl = normalized
  }

  // Collect file entries (FormData.getAll for 'files' returns all entries).
  const fileEntries = form.getAll('files').filter((v): v is File => v instanceof File && v.size > 0)
  if (fileEntries.length > MAX_FILES) {
    return NextResponse.json({ error: `At most ${MAX_FILES} files per submission` }, { status: 400 })
  }
  for (const f of fileEntries) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${f.name} exceeds ${MAX_FILE_BYTES / (1024 * 1024)}MB` }, { status: 400 })
    }
    const safeName = sanitizeFilename(f.name || 'untitled')
    const typeErr = validateAttachmentType(safeName, f.type || 'application/octet-stream')
    if (typeErr) return NextResponse.json({ error: `${f.name}: ${typeErr.message}` }, { status: 400 })
  }

  // Build the synthetic payload. Compose pitch + referral metadata so the
  // analyzer sees the full context the partner would have included in an email.
  const subject = `Manual entry: ${companyName}`
  const bodyLines = [
    `Founder: ${founderName} <${founderEmail}>`,
    companyUrl ? `Website: ${companyUrl}` : null,
    introSource ? `Intro source: ${introSource.replace(/_/g, ' ')}` : null,
    referrerName ? `Referrer: ${referrerName}${referrerEmail ? ` <${referrerEmail}>` : ''}` : null,
    '',
    pitch,
  ].filter(Boolean) as string[]
  const composedBody = bodyLines.join('\n')

  // Load each file into a base64 attachment record matching the Postmark shape
  // the rest of the pipeline expects.
  const attachments: Array<{ Name: string; ContentType: string; Content: string; ContentLength: number }> = []
  for (const file of fileEntries) {
    const buf = Buffer.from(await file.arrayBuffer())
    attachments.push({
      Name: sanitizeFilename(file.name || 'untitled'),
      ContentType: file.type || 'application/octet-stream',
      Content: buf.toString('base64'),
      ContentLength: buf.length,
    })
  }

  const messageId = `<manual-${crypto.randomUUID()}@hemrock.local>`
  const payload: SyntheticPostmarkPayload = {
    From: founderEmail,
    To: 'manual-entry@hemrock.local',
    FromFull: { Email: founderEmail, Name: founderName },
    Subject: subject,
    TextBody: composedBody,
    HtmlBody: '',
    MessageID: messageId,
    Attachments: attachments,
  }

  // MIME/extension allowlisting is not a content security boundary. Scan the
  // complete decoded set before creating any database or storage records.
  const preparedAttachments = await prepareLegacyInboundAttachments(attachments)
  if (!preparedAttachments.ok) {
    const error = preparedAttachments.code === 'attachment_unsafe'
      ? 'Attachment failed security scan'
      : attachmentFailureMessage(preparedAttachments.code)
    return NextResponse.json({ error }, { status: 400 })
  }

  // Insert the inbound_emails row that the deal will FK to.
  const { data: emailInsert, error: emailErr } = await admin
    .from('inbound_emails')
    .insert({
      fund_id: fundId,
      from_address: founderEmail,
      subject,
      received_at: new Date().toISOString(),
      raw_payload: stripAttachmentContent(payload),
      processing_status: 'processing',
      attachments_count: attachments.length,
      routing_label: 'deals',
      routing_confidence: 1.0,
      routing_reasoning: `Manual entry by ${user.email ?? user.id}`,
      routing_secondary_label: null,
      routed_to: 'deals',
    })
    .select('id')
    .single()

  if (emailErr || !emailInsert) {
    console.error('[deals/manual] inbound_emails insert failed:', emailErr)
    return NextResponse.json({ error: 'Failed to create deal' }, { status: 500 })
  }
  const emailId = (emailInsert as { id: string }).id

  // Store every attachment and commit the StoragePath metadata as one logical
  // operation. Partial writes are rolled back and never reach the Deal pipeline.
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
    return NextResponse.json({ error: 'Failed to store pitch attachments', email_id: emailId }, { status: 500 })
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
      introSource: validatedIntroSource,
      referrerName: referrerName || null,
      referrerEmail: referrerEmail || null,
    }),
  )

  // A resolved provider call is not enough: processDeal must return a durable
  // Deal id. Missing ids and thrown analysis errors both enter the same
  // deterministic fallback path before this route can report success.
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
    console.error('[deals/manual] processDeal failed:', analysisError)
  }

  let ensuredDeal
  try {
    ensuredDeal = await ensureProcessedDeal(processResult, insertFallbackDeal)
  } catch (err) {
    const fallbackError = err instanceof Error ? err.message : 'Fallback Deal insert failed'
    console.error('[deals/manual] Fallback Deal insert failed:', fallbackError)
    await admin
      .from('inbound_emails')
      .update({
        processing_status: 'failed',
        processing_error: analysisError ?? fallbackError,
      })
      .eq('id', emailId)
    return NextResponse.json({ error: 'Failed to create deal', email_id: emailId }, { status: 500 })
  }

  if (analysisError || ensuredDeal.usedFallback) {
    try {
      await queueFallbackDealResearch({ dealId: ensuredDeal.dealId, fundId })
    } catch (error) {
      console.error('[deals/manual] Could not queue fallback Deal Research:', error instanceof Error ? error.message : 'Unknown error')
    }
    const processingError = analysisError ?? 'Deal analysis returned no Deal'
    await admin
      .from('inbound_emails')
      .update({ processing_status: 'failed', processing_error: processingError })
      .eq('id', emailId)
    return NextResponse.json({
      deal_id: ensuredDeal.dealId,
      email_id: emailId,
      analysis_status: 'failed',
    })
  }

  await admin
    .from('inbound_emails')
    .update({ processing_status: 'success', processing_error: null })
    .eq('id', emailId)

  return NextResponse.json({ ok: true, email_id: emailId, deal_id: ensuredDeal.dealId })
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
