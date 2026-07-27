import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalFundOriginForId } from '@/lib/tenancy/links'
import { sendPlatformEmail } from '@/lib/email/system'
import type { Database } from '@/lib/types/database'

interface NoteInfo {
  id: string
  content: string
  companyId: string | null
  companyName: string | null
  authorName: string
  authorUserId: string
  mentionedUserIds: string[]
}

/**
 * Send email notifications for a new note.
 *
 * Recipient logic:
 * - Fetch all fund members + their notification preferences
 * - If company note, fetch company subscriptions
 * - For each member (excluding author):
 *   - level='none' → skip
 *   - level='all' → send
 *   - level='mentions' (default) → send only if @mentioned
 *   - Has company subscription → send
 *
 * Fails silently — never throws.
 */
export async function sendNoteNotifications(
  admin: SupabaseClient<Database>,
  fundId: string,
  note: NoteInfo
): Promise<void> {
  try {
    // Get fund name for email subject
    const { data: fund } = await admin
      .from('funds')
      .select('name')
      .eq('id', fundId)
      .maybeSingle()

    // Get all fund members
    const { data: members } = await admin
      .from('fund_members')
      .select('user_id, display_name')
      .eq('fund_id', fundId)

    if (!members || members.length === 0) return

    // Get notification preferences
    const { data: prefs } = await admin
      .from('note_notification_preferences')
      .select('user_id, level')
      .eq('fund_id', fundId)

    const prefMap = new Map<string, string>()
    for (const p of prefs ?? []) {
      prefMap.set(p.user_id, p.level)
    }

    // Get company subscriptions if this is a company note
    const subscribedUserIds = new Set<string>()
    if (note.companyId) {
      const { data: subs } = await admin
        .from('note_company_subscriptions')
        .select('user_id')
        .eq('company_id', note.companyId)

      for (const s of subs ?? []) subscribedUserIds.add(s.user_id)
    }

    const mentionSet = new Set(note.mentionedUserIds)

    // Determine recipients
    const recipientUserIds: string[] = []
    for (const member of members) {
      // Skip the author
      if (member.user_id === note.authorUserId) continue

      const level = prefMap.get(member.user_id) ?? 'mentions'

      if (level === 'none') continue
      if (level === 'all') {
        recipientUserIds.push(member.user_id)
        continue
      }
      // level === 'mentions'
      if (mentionSet.has(member.user_id)) {
        recipientUserIds.push(member.user_id)
        continue
      }
      // Company subscription
      if (subscribedUserIds.has(member.user_id)) {
        recipientUserIds.push(member.user_id)
      }
    }

    if (recipientUserIds.length === 0) return

    // Look up emails for recipients
    const siteUrl = await canonicalFundOriginForId(admin as never, fundId)
    const fromName = fund?.name || 'Portfolio'

    const subject = note.companyName
      ? `New note from ${note.authorName} on ${note.companyName}`
      : `New note from ${note.authorName}`

    const truncatedContent = note.content.length > 500
      ? note.content.slice(0, 500) + '...'
      : note.content

    for (const userId of recipientUserIds) {
      try {
        const { data: { user: recipient } } = await admin.auth.admin.getUserById(userId)
        if (!recipient?.email) continue

        const isMentioned = mentionSet.has(userId)
        const isSubscribed = subscribedUserIds.has(userId)
        const reason = isMentioned
          ? 'You were @mentioned in this note.'
          : isSubscribed
          ? `You follow ${note.companyName}.`
          : 'You receive all note notifications.'

        const safeAuthorName = escapeHtml(note.authorName)
        const safeCompanyName = note.companyName ? escapeHtml(note.companyName) : null
        const safeContent = escapeHtml(truncatedContent)
        const safeFromName = escapeHtml(fromName)
        const safeReason = escapeHtml(reason)
        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px;">
            <p style="margin: 0 0 12px;"><strong>${safeAuthorName}</strong>${safeCompanyName ? ` on <strong>${safeCompanyName}</strong>` : ''}:</p>
            <blockquote style="margin: 0 0 16px; padding: 12px 16px; background: #f5f5f5; border-left: 3px solid #ddd; border-radius: 4px; white-space: pre-wrap;">${safeContent}</blockquote>
            <p style="margin: 0 0 16px;"><a href="${escapeHtml(siteUrl)}/notes" style="color: #2563eb;">View in ${safeFromName}</a></p>
            <p style="margin: 0; color: #888; font-size: 12px;">${safeReason} <a href="${escapeHtml(siteUrl)}/settings" style="color: #888;">Manage preferences</a></p>
          </div>
        `.trim()

        await sendPlatformEmail({
          to: recipient.email,
          subject,
          html,
        })
      } catch (err) {
        console.error(`[notes-notify] Failed to send to user ${userId}:`, err)
      }
    }
  } catch (err) {
    console.error('[notes-notify] Error in sendNoteNotifications:', err)
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
