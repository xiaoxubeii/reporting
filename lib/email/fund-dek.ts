import { randomBytes } from 'node:crypto'
import { decrypt, encrypt } from '@/lib/crypto'
import type { FundEmailCredentialStore } from './fund-credentials'

type FundDekStore = Pick<FundEmailCredentialStore, 'compareAndSetFundDek'>

export function createFundDekResolver(
  store: FundDekStore,
  fundId: string,
  kek: string,
): () => Promise<string> {
  let resolved: Promise<string> | null = null

  return () => {
    resolved ??= (async () => {
      const candidate = randomBytes(32).toString('hex')
      const envelope = await store.compareAndSetFundDek(
        fundId,
        encrypt(candidate, kek),
      )
      if (!envelope) throw new Error('Fund encryption key is unavailable')
      return decrypt(envelope, kek)
    })()
    return resolved
  }
}
