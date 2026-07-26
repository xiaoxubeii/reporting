import { describe, expect, it } from 'vitest'
import { resolveEmailAttachmentStorageLocation } from './email-attachment-storage'

const FUND_ID = '11111111-1111-4111-8111-111111111111'
const MAILBOX_ID = '22222222-2222-4222-8222-222222222222'
const HASH = 'a'.repeat(64)

describe('resolveEmailAttachmentStorageLocation', () => {
  it('resolves legacy inbound-email paths only for the expected email', () => {
    expect(resolveEmailAttachmentStorageLocation(
      '33333333-3333-4333-8333-333333333333/deck.pdf',
      { expectedEmailId: '33333333-3333-4333-8333-333333333333' },
    )).toEqual({
      bucket: 'email-attachments',
      objectPath: '33333333-3333-4333-8333-333333333333/deck.pdf',
    })
    expect(resolveEmailAttachmentStorageLocation(
      '33333333-3333-4333-8333-333333333333/deck.pdf',
      { expectedEmailId: '44444444-4444-4444-8444-444444444444' },
    )).toBeNull()
  })

  it('resolves service-only Fund email paths only for the expected Fund', () => {
    const path = `fund-email-inbound-attachments/${FUND_ID}/${MAILBOX_ID}/${HASH}/0_${HASH}_deck.pdf`
    expect(resolveEmailAttachmentStorageLocation(path, { expectedFundId: FUND_ID })).toEqual({
      bucket: 'fund-email-inbound-attachments',
      objectPath: `${FUND_ID}/${MAILBOX_ID}/${HASH}/0_${HASH}_deck.pdf`,
    })
    expect(resolveEmailAttachmentStorageLocation(path, {
      expectedFundId: '55555555-5555-4555-8555-555555555555',
    })).toBeNull()
  })

  it('rejects traversal, absolute, malformed, and arbitrary bucket paths', () => {
    for (const path of [
      '../secret',
      '/absolute/file',
      'fund-email-inbound-attachments/not-a-fund/not-a-mailbox/hash/file',
      `other-private-bucket/${FUND_ID}/secret`,
      `fund-email-inbound-attachments/${FUND_ID}/${MAILBOX_ID}/${HASH}/../secret`,
    ]) {
      expect(resolveEmailAttachmentStorageLocation(path)).toBeNull()
    }
  })
})
