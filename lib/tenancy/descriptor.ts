import { FONT_OPTIONS, isValidHsl, type FundTheme } from '@/lib/theme'

export interface TenantDescriptor {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly logoUrl: string | null
  readonly theme: Readonly<FundTheme> | null
}

interface RawTenantDescriptor {
  readonly id: unknown
  readonly slug: unknown
  readonly name: unknown
  readonly logo_url: unknown
  readonly theme: unknown
}

interface TenantDescriptorRpcClient {
  rpc(
    name: 'resolve_public_fund_host',
    args: { readonly p_slug: string },
  ): PromiseLike<{ readonly data: unknown; readonly error: { readonly message?: string } | null }>
}

interface CacheOptions {
  readonly ttlMs?: number
  readonly maxEntries?: number
  readonly now?: () => number
}

interface CacheEntry {
  readonly expiresAt: number
  readonly value: TenantDescriptor | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeDescriptor(raw: TenantDescriptor, trustedSlug: string): TenantDescriptor {
  if (raw.slug !== trustedSlug) throw new Error('Tenant descriptor does not match trusted slug')
  if (
    typeof raw.id !== 'string'
    || !UUID.test(raw.id)
    || typeof raw.name !== 'string'
    || !raw.name.trim()
    || (raw.logoUrl !== null && typeof raw.logoUrl !== 'string')
    || (raw.theme !== null && (typeof raw.theme !== 'object' || Array.isArray(raw.theme)))
  ) {
    throw new Error('Invalid tenant descriptor')
  }

  const theme = normalizePublicTheme(raw.theme)
  return Object.freeze({
    id: raw.id,
    slug: trustedSlug,
    name: raw.name,
    logoUrl: raw.logoUrl,
    theme,
  })
}

function normalizePublicTheme(value: unknown): Readonly<FundTheme> | null {
  if (value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid tenant descriptor')
  const raw = value as Record<string, unknown>
  const accent = typeof raw.accent === 'string' && isValidHsl(raw.accent) ? raw.accent : undefined
  const font = typeof raw.font === 'string' && FONT_OPTIONS.some(option => option.key === raw.font)
    ? raw.font
    : undefined
  const radius = typeof raw.radius === 'number' && Number.isFinite(raw.radius) && raw.radius >= 0 && raw.radius <= 2
    ? raw.radius
    : undefined
  return Object.freeze({
    ...(accent ? { accent } : {}),
    ...(font ? { font } : {}),
    ...(radius !== undefined ? { radius } : {}),
  })
}

export class TenantDescriptorCache {
  private entries: ReadonlyMap<string, CacheEntry> = new Map()
  private pending: ReadonlyMap<string, Promise<TenantDescriptor | null>> = new Map()
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly now: () => number

  constructor(options: CacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 15_000
    this.maxEntries = Math.max(1, options.maxEntries ?? 256)
    this.now = options.now ?? Date.now
  }

  async resolve(
    trustedSlug: string,
    load: (trustedSlug: string) => Promise<TenantDescriptor | null>,
  ): Promise<TenantDescriptor | null> {
    const cached = this.entries.get(trustedSlug)
    if (cached && cached.expiresAt > this.now()) return cached.value

    const inFlight = this.pending.get(trustedSlug)
    if (inFlight) return inFlight

    const promise = load(trustedSlug)
      .then(raw => raw === null ? null : normalizeDescriptor(raw, trustedSlug))
      .then(value => {
        const withoutExpired = Array.from(this.entries.entries())
          .filter(([, entry]) => entry.expiresAt > this.now())
          .filter(([slug]) => slug !== trustedSlug)
        const bounded = withoutExpired.slice(-(this.maxEntries - 1))
        this.entries = new Map([
          ...bounded,
          [trustedSlug, { value, expiresAt: this.now() + this.ttlMs }] as const,
        ])
        return value
      })
      .finally(() => {
        this.pending = new Map(Array.from(this.pending.entries()).filter(([slug]) => slug !== trustedSlug))
      })

    this.pending = new Map([...Array.from(this.pending.entries()), [trustedSlug, promise]])
    return promise
  }
}

export async function loadTenantDescriptor(
  client: TenantDescriptorRpcClient,
  trustedSlug: string,
): Promise<TenantDescriptor | null> {
  const { data, error } = await client.rpc('resolve_public_fund_host', { p_slug: trustedSlug })
  if (error) throw new Error(`Unable to resolve tenant Fund: ${error.message ?? 'database error'}`)
  if (!Array.isArray(data) || data.length === 0) return null
  if (data.length !== 1) throw new Error('Invalid tenant descriptor result')
  const raw = data[0] as RawTenantDescriptor
  return normalizeDescriptor({
    id: raw.id as string,
    slug: raw.slug as string,
    name: raw.name as string,
    logoUrl: raw.logo_url as string | null,
    theme: raw.theme as Readonly<Record<string, unknown>> | null,
  }, trustedSlug)
}

const sharedTenantDescriptorCache = new TenantDescriptorCache()

export function resolveTenantDescriptor(
  client: TenantDescriptorRpcClient,
  trustedSlug: string,
): Promise<TenantDescriptor | null> {
  return sharedTenantDescriptorCache.resolve(
    trustedSlug,
    slug => loadTenantDescriptor(client, slug),
  )
}
