import { afterEach, describe, expect, it } from 'vitest'
import { decrypt, encrypt } from '@/lib/crypto'
import {
  deleteMinifluxCredential,
  getMinifluxConnectionMetadata,
  getMinifluxCredential,
  saveMinifluxCredential,
} from './credentials'

const KEK = '11'.repeat(32)
const LEGACY_FUND_DEK = '22'.repeat(32)

function fakeAdmin(seed: Record<string, Record<string, unknown>>, tableError: { code?: string; message: string } | null = null) {
  const tables = structuredClone(seed)
  const writes: Array<{ table: string; value: Record<string, unknown> }> = []

  return {
    tables,
    writes,
    from(table: string) {
      let filters: Record<string, unknown> = {}
      return {
        select() { return this },
        eq(column: string, value: unknown) { filters = { ...filters, [column]: value }; return this },
        async maybeSingle() {
          if (tableError) return { data: null, error: tableError }
          const row = tables[table]
          return {
            data: row && Object.entries(filters).every(([key, value]) => row[key] === value) ? row : null,
            error: null,
          }
        },
        async upsert(value: Record<string, unknown>) {
          if (tableError) return { error: tableError }
          writes.push({ table, value: { ...value } })
          tables[table] = { ...value }
          return { error: null }
        },
        delete() {
          return {
            async eq(column: string, value: unknown) {
              if (tableError) return { error: tableError }
              if (tables[table]?.[column] === value) delete tables[table]
              return { error: null }
            },
          }
        },
      }
    },
  }
}

describe('Miniflux credentials', () => {
  afterEach(() => { delete process.env.ENCRYPTION_KEY })

  it('encrypts one manually supplied token keyed only by reporting user id', async () => {
    process.env.ENCRYPTION_KEY = KEK
    const admin = fakeAdmin({
      fund_settings: {
        fund_id: undefined,
        encryption_key_encrypted: encrypt(LEGACY_FUND_DEK, KEK),
      },
    })

    await (saveMinifluxCredential as any)(admin, {
      userId: 'user-1',
      apiToken: 'secret-token',
      externalUserId: 42,
      username: 'reader-user-1',
    })

    const write = admin.writes.find(item => item.table === 'miniflux_connections')
    expect(write?.value).toMatchObject({ user_id: 'user-1' })
    expect(write?.value).not.toHaveProperty('fund_id')
    expect(write?.value.api_token_encrypted).not.toBe('secret-token')
    const storedCiphertext = String(write?.value.api_token_encrypted)
    expect(storedCiphertext).toMatch(/^v1:/)
    expect(decrypt(storedCiphertext.slice(3), KEK, 'miniflux:user-1:42:v1')).toBe('secret-token')
    await expect((getMinifluxCredential as any)(admin, 'user-1')).resolves.toMatchObject({
      apiToken: 'secret-token',
      username: 'reader-user-1',
    })
  })

  it('binds encrypted tokens to the reporting user and verified Miniflux identity', async () => {
    process.env.ENCRYPTION_KEY = KEK
    const sourceAdmin = fakeAdmin({})
    await (saveMinifluxCredential as any)(sourceAdmin, {
      userId: 'user-1', apiToken: 'secret-token', externalUserId: 42, username: 'reader-1',
    })
    const ciphertext = sourceAdmin.tables.miniflux_connections.api_token_encrypted
    const swappedAdmin = fakeAdmin({
      miniflux_connections: {
        user_id: 'user-2',
        api_token_encrypted: ciphertext,
        external_user_id: 42,
        username: 'reader-1',
        last_verified_at: null,
        last_error: null,
      },
    })

    await expect((getMinifluxCredential as any)(swappedAdmin, 'user-2')).resolves.toBeNull()
  })

  it('rejects blank API tokens and deletes only by reporting user id', async () => {
    process.env.ENCRYPTION_KEY = KEK
    const admin = fakeAdmin({
      miniflux_connections: { user_id: 'user-1', api_token_encrypted: 'ciphertext' },
    })

    await expect((saveMinifluxCredential as any)(admin, {
      userId: 'user-1', apiToken: ' ', externalUserId: 1, username: 'reader',
    })).rejects.toThrow(/token/i)
    await expect((deleteMinifluxCredential as any)(admin, 'user-1')).resolves.toBeUndefined()
    expect(admin.tables.miniflux_connections).toBeUndefined()
  })

  it('treats a missing connection migration as unconfigured for reads and fails writes closed', async () => {
    process.env.ENCRYPTION_KEY = KEK
    const admin = fakeAdmin({}, {
      code: 'PGRST205',
      message: "Could not find the table 'public.miniflux_connections' in the schema cache",
    })

    await expect((getMinifluxConnectionMetadata as any)(admin, 'user-1')).resolves.toEqual({
      connected: false,
      username: null,
      lastVerifiedAt: null,
      lastError: null,
    })
    await expect((getMinifluxCredential as any)(admin, 'user-1')).resolves.toBeNull()
    await expect((saveMinifluxCredential as any)(admin, {
      userId: 'user-1', apiToken: 'token', externalUserId: 1, username: 'reader',
    })).rejects.toMatchObject({ code: 'not_configured', status: 503 })
  })
})
