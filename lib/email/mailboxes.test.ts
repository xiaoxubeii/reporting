/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory store fixtures model partial database rows */
import { describe, expect, it } from 'vitest'
import {
  ensureReservedFundMailboxes,
  resolveFundSenderMailbox,
  setCurrentUserMailbox,
  type FundEmailMailbox,
  type FundEmailMailboxStore,
} from './mailboxes'

function memoryMailboxStore(): FundEmailMailboxStore & { rows: Map<string, any>; ensured: string[] } {
  const rows = new Map<string, any>()
  const memberships = new Set(['fund-a:user-a', 'fund-b:user-b'])
  const ensured: string[] = []
  return {
    rows,
    ensured,
    async hasMembership(fundId, userId) { return memberships.has(`${fundId}:${userId}`) },
    async ensureReserved(fundId) {
      ensured.push(fundId)
      for (const localPart of ['pitch', 'expert']) {
        rows.set(`${fundId}:${localPart}`, {
          id: `${fundId}-${localPart}`,
          fundId,
          localPart,
          displayName: localPart === 'pitch' ? 'Pitch' : 'Expert',
          kind: localPart,
          userId: null,
          active: true,
        })
      }
    },
    async setUserMailbox(input) {
      const row: FundEmailMailbox = {
        id: `${input.fundId}-${input.userId}`,
        kind: 'user',
        active: true,
        ...input,
      }
      rows.set(`${input.fundId}:${input.localPart}`, row)
      rows.set(`${input.fundId}:user:${input.userId}`, row)
      return row
    },
    async getUserMailbox(fundId, userId) { return rows.get(`${fundId}:user:${userId}`) ?? null },
    async getSharedMailbox(fundId, localPart) { return rows.get(`${fundId}:${localPart}`) ?? null },
  }
}

describe('Fund email mailboxes', () => {
  it('creates reserved mailboxes idempotently and permits the same username in different Funds', async () => {
    const store = memoryMailboxStore()
    await ensureReservedFundMailboxes({} as never, 'fund-a', { store })
    await ensureReservedFundMailboxes({} as never, 'fund-a', { store })
    const a = await setCurrentUserMailbox({} as never, {
      fundId: 'fund-a', userId: 'user-a', localPart: 'alice', displayName: 'Alice A',
    }, { store })
    const b = await setCurrentUserMailbox({} as never, {
      fundId: 'fund-b', userId: 'user-b', localPart: 'alice', displayName: 'Alice B',
    }, { store })
    expect(a.localPart).toBe('alice')
    expect(b.localPart).toBe('alice')
    expect(a.fundId).not.toBe(b.fundId)
  })

  it('rejects non-members, reserved local parts, and header injection', async () => {
    const store = memoryMailboxStore()
    await expect(setCurrentUserMailbox({} as never, {
      fundId: 'fund-a', userId: 'outsider', localPart: 'alice', displayName: 'Alice',
    }, { store })).rejects.toMatchObject({ code: 'membership_required' })
    await expect(setCurrentUserMailbox({} as never, {
      fundId: 'fund-a', userId: 'user-a', localPart: 'pitch', displayName: 'Alice',
    }, { store })).rejects.toThrow(/reserved/i)
    await expect(setCurrentUserMailbox({} as never, {
      fundId: 'fund-a', userId: 'user-a', localPart: 'alice', displayName: 'Alice\nBcc: x@y.test',
    }, { store })).rejects.toThrow(/header/i)
  })

  it('resolves a live member user mailbox and falls back only to the requested reserved mailbox', async () => {
    const store = memoryMailboxStore()
    await ensureReservedFundMailboxes({} as never, 'fund-a', { store })
    await setCurrentUserMailbox({} as never, {
      fundId: 'fund-a', userId: 'user-a', localPart: 'alice', displayName: 'Alice',
    }, { store })
    await expect(resolveFundSenderMailbox({} as never, {
      fundId: 'fund-a', userId: 'user-a', fallback: 'expert',
    }, { store })).resolves.toMatchObject({ localPart: 'alice', userId: 'user-a' })

    store.rows.delete('fund-a:user:user-a')
    await expect(resolveFundSenderMailbox({} as never, {
      fundId: 'fund-a', userId: 'user-a', fallback: 'expert',
    }, { store })).resolves.toMatchObject({ localPart: 'expert', kind: 'expert' })
    await expect(resolveFundSenderMailbox({} as never, {
      fundId: 'fund-a', userId: 'outsider', fallback: 'expert',
    }, { store })).rejects.toMatchObject({ code: 'membership_required' })
  })
})
