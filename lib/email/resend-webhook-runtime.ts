import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { dispatchFundInboundBusinessAction } from './fund-inbound-actions'
import { resolveVerifiedFundEmailReceivingConnectionByRouteToken } from './fund-credentials'
import {
  createSupabaseFundEmailInboundPersistence,
  createSupabaseFundEmailInboundRoutingStore,
  createSupabaseFundEmailWebhookEventStore,
} from './fund-inbound-store'
import { routeFundInboundEmail } from './inbound-routing'
import {
  materializeResendInboundAttachments,
  retrieveResendInboundEmail,
} from './resend-inbound'
import type { ResendWebhookDependencies } from './resend-webhook'

export function createResendWebhookRuntime(
  admin: SupabaseClient,
): ResendWebhookDependencies {
  const eventStore = createSupabaseFundEmailWebhookEventStore(admin)
  const routingStore = createSupabaseFundEmailInboundRoutingStore(admin)
  const persist = createSupabaseFundEmailInboundPersistence(admin)

  return {
    resolveConnection: async (routeToken) => {
      const connection =
        await resolveVerifiedFundEmailReceivingConnectionByRouteToken(
          admin,
          routeToken,
        )
      if (!connection) return null
      const selected = await admin
        .from('fund_settings')
        .select('inbound_email_provider')
        .eq('fund_id', connection.fundId)
        .maybeSingle()
      if (selected.error || selected.data?.inbound_email_provider !== 'resend')
        return null
      return connection
    },
    verify(rawBody, headers, webhookSecret) {
      return new Resend().webhooks.verify({
        payload: rawBody,
        headers,
        webhookSecret,
      })
    },
    claim: (input) => eventStore.claim(input),
    retrieve: (connection, event) =>
      retrieveResendInboundEmail(admin, connection, event),
    route: (connection, email) =>
      routeFundInboundEmail({
        fundId: connection.fundId,
        domain: connection.domain,
        email,
        store: routingStore,
      }),
    materializeAttachments: async (connection, email, routing) => {
      const materializedEmail = await materializeResendInboundAttachments(
        admin,
        connection,
        email,
        routing,
      )
      return {
        email: materializedEmail,
        routing: materializedEmail.quarantineReason
          ? {
              disposition: 'quarantined',
              reason: materializedEmail.quarantineReason,
            }
          : routing,
      }
    },
    persist: async (connection, email, routing) => {
      const persisted = await persist(connection, email, routing)
      await dispatchFundInboundBusinessAction({
        admin,
        connection,
        email,
        routing,
        persisted,
      })
    },
    complete: (eventId, attemptId, disposition) =>
      eventStore.complete(eventId, attemptId, disposition),
    fail: (eventId, attemptId, errorCode) =>
      eventStore.fail(eventId, attemptId, errorCode),
  }
}
