import { hashFundReplyToken, type FundEmailPurpose } from './fund-outbound'
import type { RetrievedResendInboundEmail } from './resend-inbound'

export interface FundEmailInboundThreadMatch {
  threadId: string
  mailboxId: string
  purpose: FundEmailPurpose
}

export interface FundEmailInboundMailboxMatch {
  mailboxId: string
  localPart: string
  purpose: FundEmailPurpose
}

export interface FundEmailInboundRoutingStore {
  findReplyRoute(
    fundId: string,
    tokenHash: string,
  ): Promise<FundEmailInboundThreadMatch | null>
  findThreadByInternetMessageIds(
    fundId: string,
    messageIds: string[],
  ): Promise<FundEmailInboundThreadMatch[]>
  findMailboxesByLocalParts(
    fundId: string,
    localParts: string[],
  ): Promise<FundEmailInboundMailboxMatch[]>
}

export type FundEmailInboundRoutingResult =
  | ({
      disposition: 'routed'
      source: 'reply_token' | 'rfc_headers'
    } & FundEmailInboundThreadMatch)
  | ({
      disposition: 'routed'
      source: 'mailbox'
      threadId: null
    } & FundEmailInboundMailboxMatch)
  | { disposition: 'quarantined'; reason: string }
  | { disposition: 'unroutable'; reason: string }

export async function routeFundInboundEmail(input: {
  fundId: string
  domain: string
  email: RetrievedResendInboundEmail
  store: FundEmailInboundRoutingStore
}): Promise<FundEmailInboundRoutingResult> {
  if (input.email.quarantineReason) {
    return { disposition: 'quarantined', reason: input.email.quarantineReason }
  }

  const localParts = fundRecipientLocalParts(input.email, input.domain)
  if (localParts.length === 0) {
    return { disposition: 'unroutable', reason: 'fund_recipient_not_found' }
  }

  const replyTokenResult = extractReplyToken(localParts)
  if (replyTokenResult.kind === 'invalid') {
    return { disposition: 'quarantined', reason: replyTokenResult.reason }
  }
  if (replyTokenResult.kind === 'valid') {
    const replyMatch = await input.store.findReplyRoute(
      input.fundId,
      hashFundReplyToken(replyTokenResult.token),
    )
    if (!replyMatch) {
      return { disposition: 'quarantined', reason: 'unknown_reply_token' }
    }
    const rfcMatch = await resolveRfcMatch(input)
    if (rfcMatch.kind === 'conflict' || (
      rfcMatch.kind === 'match'
      && !sameThread(replyMatch, rfcMatch.value)
    )) {
      return { disposition: 'quarantined', reason: 'routing_identity_conflict' }
    }
    return { disposition: 'routed', source: 'reply_token', ...replyMatch }
  }

  const rfcMatch = await resolveRfcMatch(input)
  if (rfcMatch.kind === 'conflict') {
    return { disposition: 'quarantined', reason: 'routing_identity_conflict' }
  }
  if (rfcMatch.kind === 'match') {
    return { disposition: 'routed', source: 'rfc_headers', ...rfcMatch.value }
  }

  const mailboxMatches = uniqueMailboxes(await input.store.findMailboxesByLocalParts(
    input.fundId,
    localParts,
  ))
  if (mailboxMatches.length === 0) {
    return { disposition: 'unroutable', reason: 'mailbox_not_found' }
  }
  if (mailboxMatches.length > 1) {
    return { disposition: 'quarantined', reason: 'multiple_mailboxes' }
  }
  return {
    disposition: 'routed',
    source: 'mailbox',
    threadId: null,
    ...mailboxMatches[0],
  }
}

type ReplyTokenResult =
  | { kind: 'none' }
  | { kind: 'valid'; token: string }
  | { kind: 'invalid'; reason: string }

function extractReplyToken(localParts: string[]): ReplyTokenResult {
  const aliases = localParts.filter(localPart => localPart.startsWith('r_'))
  if (aliases.length === 0) return { kind: 'none' }
  if (aliases.length !== 1) return { kind: 'invalid', reason: 'multiple_reply_tokens' }
  const match = aliases[0].match(/^r_([a-f0-9]{40})$/)
  return match
    ? { kind: 'valid', token: match[1] }
    : { kind: 'invalid', reason: 'invalid_reply_token' }
}

async function resolveRfcMatch(input: {
  fundId: string
  email: RetrievedResendInboundEmail
  store: FundEmailInboundRoutingStore
}): Promise<
  | { kind: 'none' }
  | { kind: 'match'; value: FundEmailInboundThreadMatch }
  | { kind: 'conflict' }
> {
  const messageIds = Array.from(new Set([
    input.email.inReplyTo,
    ...input.email.references,
  ].filter((value): value is string => Boolean(value))))
  if (messageIds.length === 0) return { kind: 'none' }
  const matches = uniqueThreads(await input.store.findThreadByInternetMessageIds(
    input.fundId,
    messageIds,
  ))
  if (matches.length === 0) return { kind: 'none' }
  if (matches.length > 1) return { kind: 'conflict' }
  return { kind: 'match', value: matches[0] }
}

function fundRecipientLocalParts(
  email: Pick<RetrievedResendInboundEmail, 'to' | 'cc' | 'bcc'>,
  domainInput: string,
): string[] {
  const domain = domainInput.trim().toLowerCase()
  const localParts = [...email.to, ...email.cc, ...email.bcc]
    .map(parseAddress)
    .filter((address): address is { localPart: string; domain: string } => Boolean(address))
    .filter(address => address.domain === domain)
    .map(address => address.localPart)
  return Array.from(new Set(localParts)).sort()
}

function parseAddress(input: string): { localPart: string; domain: string } | null {
  const address = input.match(/<([^<>]+)>/)?.[1] ?? input
  const match = address.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/)
  return match ? { localPart: match[1], domain: match[2] } : null
}

function uniqueThreads(matches: FundEmailInboundThreadMatch[]): FundEmailInboundThreadMatch[] {
  return Array.from(
    new Map(matches.map(match => [
      `${match.threadId}:${match.mailboxId}`,
      { ...match },
    ])).values(),
  )
}

function uniqueMailboxes(matches: FundEmailInboundMailboxMatch[]): FundEmailInboundMailboxMatch[] {
  return Array.from(
    new Map(matches.map(match => [match.mailboxId, { ...match }])).values(),
  )
}

function sameThread(
  left: FundEmailInboundThreadMatch,
  right: FundEmailInboundThreadMatch,
): boolean {
  return left.threadId === right.threadId && left.mailboxId === right.mailboxId
}
