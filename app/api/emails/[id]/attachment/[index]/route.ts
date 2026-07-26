import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEmailAttachmentStorageLocation } from '@/lib/security/email-attachment-storage'

/**
 * Download an attachment from an inbound email. Linked from the deal-detail
 * page (`/deals/[id]`) as `/api/emails/${email_id}/attachment/${index}`.
 *
 * Security model:
 *   - Auth: caller must be a member of the fund that owns the email.
 *   - Index is validated against `raw_payload.Attachments[]`.
 *   - We use Supabase Storage's signed-URL `download` option, which sets
 *     `Content-Disposition: attachment` server-side. That forces the browser
 *     to save the file rather than render it inline — defends against MIME
 *     confusion attacks where a submitter claimed `text/html` (or similar)
 *     on the attachment and would otherwise execute scripts in the partner's
 *     authenticated session.
 *   - Signed URLs are short-lived (60s) so they can't be leaked or shared.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string; index: string } }) {
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
  const fundId = membership.fund_id

  const idx = Number.parseInt(params.index, 10)
  if (!Number.isInteger(idx) || idx < 0 || idx > 99) {
    return NextResponse.json({ error: 'Invalid attachment index' }, { status: 400 })
  }

  const { data: email } = await admin
    .from('inbound_emails')
    .select('id, fund_id, raw_payload')
    .eq('id', params.id)
    .eq('fund_id', fundId)
    .maybeSingle()
  if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const payload = (email.raw_payload ?? {}) as {
    Attachments?: Array<{
    Name?: string
    ContentType?: string
    StoragePath?: string
    }>
  }
  const attachments = payload.Attachments ?? []
  const att = attachments[idx]
  if (!att?.StoragePath) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  // Legacy objects live under the inbound email UUID. Fund Resend objects live
  // in a service-only bucket under the owning Fund UUID. Re-derive the bucket
  // and enforce the matching owner before signing a URL.
  const location = resolveEmailAttachmentStorageLocation(att.StoragePath, {
    expectedEmailId: params.id,
    expectedFundId: fundId,
  })
  if (!location) {
    return NextResponse.json({ error: 'Storage path mismatch' }, { status: 400 })
  }

  // Force Content-Disposition: attachment on the signed URL so the browser
  // saves rather than renders. The filename passed here ends up in the
  // header verbatim, so sanitize it to plain ASCII-safe characters.
  const downloadName = (att.Name ?? 'attachment').replace(/[^\w.\-]/g, '_').slice(0, 200)
  const { data: signed, error } = await admin.storage
    .from(location.bucket)
    .createSignedUrl(location.objectPath, 60, { download: downloadName })
  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? 'Failed to sign URL' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl, 302)
}
