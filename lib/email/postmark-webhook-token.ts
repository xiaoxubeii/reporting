import { randomBytes } from 'node:crypto'
import { decrypt, encrypt } from '@/lib/crypto'

export function mintPostmarkWebhookCredential(
  encryptedFundKey: string,
  masterKey: string,
): { rawToken: string; encryptedToken: string } {
  const rawToken = randomBytes(32).toString('base64url')
  const fundKey = decrypt(encryptedFundKey, masterKey)
  return { rawToken, encryptedToken: encrypt(rawToken, fundKey) }
}
