import { describe, expect, it } from 'vitest'
import { decrypt, encrypt } from '@/lib/crypto'
import { mintPostmarkWebhookCredential } from './postmark-webhook-token'

describe('Postmark webhook credential rotation', () => {
  it('returns a high-entropy token once and stores only its ciphertext', () => {
    const masterKey = '11'.repeat(32)
    const fundKey = '22'.repeat(32)
    const credential = mintPostmarkWebhookCredential(encrypt(fundKey, masterKey), masterKey)

    expect(credential.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(credential.encryptedToken).not.toContain(credential.rawToken)
    expect(decrypt(credential.encryptedToken, fundKey)).toBe(credential.rawToken)
  })
})
