import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from '@/lib/crypto'
import type { Database, Json } from '@/lib/types/database'
import { deriveFundEmailDomain, normalizeFundEmailSlug } from './domain'
import { FundEmailError } from './errors'
import type { ResendFundDomainInspection } from './resend-domain'

const CIPHERTEXT_VERSION = 'v1'
type Admin = SupabaseClient<Database>

type CredentialField =
  | 'sending_api_key'
  | 'receiving_api_key'
  | 'webhook_secret'

export interface FundEmailSecurityState {
  emailSubdomain: string | null
  encryptionKeyEncrypted: string | null
  resendApiKeyConfigured?: boolean
}

export interface StoredFundEmailConnection {
  id: string
  fundId: string
  domain: string
  sendingApiKeyEncrypted: string | null
  receivingApiKeyEncrypted: string | null
  webhookSecretEncrypted: string | null
  routeTokenHash: string | null
  providerWebhookId: string | null
  previousRouteTokenHash: string | null
  previousRouteExpiresAt: string | null
  status: 'enabled' | 'disabled' | 'error'
  domainStatus: 'pending' | 'verified' | 'failed'
  sendingStatus: 'pending' | 'verified' | 'failed'
  receivingStatus: 'pending' | 'verified' | 'failed'
  lastVerifiedAt: string | null
  lastErrorCode: string | null
  createdAt: string
  updatedAt: string
}

interface UpsertConnectionInput {
  fundId: string
  domain: string
  sendingApiKeyEncrypted: string
  receivingApiKeyEncrypted: string
  webhookSecretEncrypted: string
  routeTokenHash: string
  actorUserId: string
}

interface CreateConnectionInput extends UpsertConnectionInput {
  slug: string
}

interface ConfigureSendingInput {
  fundId: string
  slug: string
  domain: string
  sendingApiKeyEncrypted: string
  actorUserId: string
}

interface ConfigureIdentityInput {
  fundId: string
  slug: string
  domain: string
  actorUserId: string
}

interface ConfigureReceivingInput {
  fundId: string
  slug: string
  domain: string
  receivingApiKeyEncrypted: string
  webhookSecretEncrypted: string
  routeTokenHash: string
  providerWebhookId: string
  expectedProviderWebhookId: string | null
  expectedUpdatedAt: string | null
  inspection: ResendFundDomainInspection
  actorUserId: string
}

export interface FundEmailCredentialStore {
  getFundSecurityState(fundId: string): Promise<FundEmailSecurityState | null>
  compareAndSetFundDek(fundId: string, envelope: string): Promise<string | null>
  setFundEmailSubdomain(fundId: string, slug: string): Promise<void>
  getConnectionByFundId(
    fundId: string,
  ): Promise<StoredFundEmailConnection | null>
  getConnectionByRouteHash(
    hash: string,
  ): Promise<StoredFundEmailConnection | null>
  configureIdentity(input: ConfigureIdentityInput): Promise<void>
  configureSending(input: ConfigureSendingInput): Promise<void>
  configureReceiving(input: ConfigureReceivingInput): Promise<void>
  createConnection(input: CreateConnectionInput): Promise<void>
  upsertConnection(input: UpsertConnectionInput): Promise<void>
  updateSecrets(
    fundId: string,
    values: Pick<
      UpsertConnectionInput,
      | 'sendingApiKeyEncrypted'
      | 'receivingApiKeyEncrypted'
      | 'webhookSecretEncrypted'
      | 'actorUserId'
    >,
  ): Promise<boolean>
  updateRouteHash(
    fundId: string,
    routeTokenHash: string,
    actorUserId: string,
  ): Promise<boolean>
  deleteConnection(fundId: string): Promise<boolean>
  ensureReservedMailboxes(fundId: string): Promise<void>
}

interface CredentialDependencies {
  store?: FundEmailCredentialStore
  generateRouteToken?: () => string
}

export interface FundEmailConnection {
  id: string
  fundId: string
  domain: string
  sendingApiKey: string
  sendingApiKeyEncrypted?: string
  receivingApiKey: string
  webhookSecret: string
}

export interface FundEmailSendingConnection {
  id: string
  fundId: string
  domain: string
  sendingApiKey: string
  sendingApiKeyEncrypted?: string
}

export type FundEmailIdentityConnection = Pick<
  FundEmailSendingConnection,
  'id' | 'fundId' | 'domain'
>

export interface FundEmailReceivingConfiguration {
  id: string
  fundId: string
  domain: string
  receivingApiKey: string
  webhookSecret: string
  providerWebhookId?: string | null
  routeTokenHash?: string
  updatedAt?: string
}

export interface FundEmailConnectionStatus {
  configured: boolean
  emailSubdomain: string | null
  domain: string | null
  status: StoredFundEmailConnection['status'] | 'not_configured'
  domainStatus: StoredFundEmailConnection['domainStatus'] | null
  sendingStatus: StoredFundEmailConnection['sendingStatus'] | null
  receivingStatus: StoredFundEmailConnection['receivingStatus'] | null
  sendingConfigured: boolean
  receivingConfigured: boolean
  webhookConfigured: boolean
  webhookManaged: boolean
  lastVerifiedAt: string | null
  lastErrorCode: string | null
  createdAt: string | null
  updatedAt: string | null
}

export function credentialAssociatedData(
  fundId: string,
  field: CredentialField,
): string {
  return `fund-email:${CIPHERTEXT_VERSION}:${fundId}:${field}`
}

export function generateFundEmailRouteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashFundEmailRouteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export async function saveFundEmailSendingConfiguration(
  admin: Admin,
  params: {
    fundId: string
    actorUserId: string
    slug: string
    sendingApiKey: string
  },
  dependencies: CredentialDependencies = {},
): Promise<{ domain: string }> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const state = await requiredFundState(store, params.fundId)
  const slug = normalizeFundEmailSlug(params.slug)
  const domain = deriveFundEmailDomain(slug)
  assertCompatibleStagedConnection(
    state,
    await store.getConnectionByFundId(params.fundId),
    slug,
    domain,
  )
  const dek = await getOrCreateFundDek(store, params.fundId, state)
  await store.configureSending({
    fundId: params.fundId,
    slug,
    domain,
    sendingApiKeyEncrypted: encryptCredential(
      validSecret(params.sendingApiKey, 'sending API key'),
      dek,
      params.fundId,
      'sending_api_key',
    ),
    actorUserId: params.actorUserId,
  })
  return { domain }
}

export async function saveFundEmailIdentity(
  admin: Admin,
  params: { fundId: string; actorUserId: string; slug: string },
  dependencies: CredentialDependencies = {},
): Promise<{ domain: string }> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const state = await requiredFundState(store, params.fundId)
  const slug = normalizeFundEmailSlug(params.slug)
  const domain = deriveFundEmailDomain(slug)
  assertCompatibleStagedConnection(
    state,
    await store.getConnectionByFundId(params.fundId),
    slug,
    domain,
  )
  await store.configureIdentity({
    fundId: params.fundId,
    slug,
    domain,
    actorUserId: params.actorUserId,
  })
  return { domain }
}

export async function saveFundEmailReceivingConfiguration(
  admin: Admin,
  params: {
    fundId: string
    actorUserId: string
    slug: string
    receivingApiKey: string
    webhookSecret: string
    routeToken: string
    providerWebhookId: string
    expectedProviderWebhookId: string | null
    expectedUpdatedAt: string | null
    inspection: ResendFundDomainInspection
  },
  dependencies: CredentialDependencies = {},
): Promise<{ domain: string }> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const state = await requiredFundState(store, params.fundId)
  const slug = normalizeFundEmailSlug(params.slug)
  const domain = deriveFundEmailDomain(slug)
  assertCompatibleStagedConnection(
    state,
    await store.getConnectionByFundId(params.fundId),
    slug,
    domain,
  )
  assertRouteToken(params.routeToken)
  const providerWebhookId = validProviderWebhookId(params.providerWebhookId)
  const dek = await getOrCreateFundDek(store, params.fundId, state)
  await store.configureReceiving({
    fundId: params.fundId,
    slug,
    domain,
    receivingApiKeyEncrypted: encryptCredential(
      validSecret(params.receivingApiKey, 'receiving API key'),
      dek,
      params.fundId,
      'receiving_api_key',
    ),
    webhookSecretEncrypted: encryptCredential(
      validSecret(params.webhookSecret, 'webhook signing secret'),
      dek,
      params.fundId,
      'webhook_secret',
    ),
    routeTokenHash: hashFundEmailRouteToken(params.routeToken),
    providerWebhookId,
    expectedProviderWebhookId: params.expectedProviderWebhookId,
    expectedUpdatedAt: params.expectedUpdatedAt,
    inspection: params.inspection,
    actorUserId: params.actorUserId,
  })
  return { domain }
}

export async function saveFundEmailConnection(
  admin: Admin,
  params: {
    fundId: string
    actorUserId: string
    slug: string
    sendingApiKey: string
    receivingApiKey: string
    webhookSecret: string
  },
  dependencies: CredentialDependencies = {},
): Promise<{ domain: string; routeToken: string }> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const state = await requiredFundState(store, params.fundId)
  const slug = normalizeFundEmailSlug(params.slug)
  const domain = deriveFundEmailDomain(slug)
  const existing = await store.getConnectionByFundId(params.fundId)
  if (existing) {
    throw new FundEmailError(
      'connection_conflict',
      'Fund email is already configured. Use an explicit rotation operation.',
      409,
    )
  }
  if (state.emailSubdomain && state.emailSubdomain !== slug) {
    throw new FundEmailError(
      'connection_conflict',
      'This Fund already has a different email slug.',
      409,
    )
  }

  const sendingApiKey = validSecret(params.sendingApiKey, 'sending API key')
  const receivingApiKey = validSecret(
    params.receivingApiKey,
    'receiving API key',
  )
  const webhookSecret = validSecret(
    params.webhookSecret,
    'webhook signing secret',
  )
  const dek = await getOrCreateFundDek(store, params.fundId, state)
  const routeToken = (
    dependencies.generateRouteToken ?? generateFundEmailRouteToken
  )()
  assertRouteToken(routeToken)

  await store.createConnection({
    fundId: params.fundId,
    slug,
    domain,
    sendingApiKeyEncrypted: encryptCredential(
      sendingApiKey,
      dek,
      params.fundId,
      'sending_api_key',
    ),
    receivingApiKeyEncrypted: encryptCredential(
      receivingApiKey,
      dek,
      params.fundId,
      'receiving_api_key',
    ),
    webhookSecretEncrypted: encryptCredential(
      webhookSecret,
      dek,
      params.fundId,
      'webhook_secret',
    ),
    routeTokenHash: hashFundEmailRouteToken(routeToken),
    actorUserId: params.actorUserId,
  })
  return { domain, routeToken }
}

export async function rotateFundEmailCredentials(
  admin: Admin,
  params: {
    fundId: string
    actorUserId: string
    sendingApiKey: string
    receivingApiKey: string
    webhookSecret: string
  },
  dependencies: CredentialDependencies = {},
): Promise<void> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const existing = await store.getConnectionByFundId(params.fundId)
  if (!existing) throw connectionNotFound()
  const state = await requiredFundState(store, params.fundId)
  const dek = await getOrCreateFundDek(store, params.fundId, state)
  const updated = await store.updateSecrets(params.fundId, {
    sendingApiKeyEncrypted: encryptCredential(
      validSecret(params.sendingApiKey, 'sending API key'),
      dek,
      params.fundId,
      'sending_api_key',
    ),
    receivingApiKeyEncrypted: encryptCredential(
      validSecret(params.receivingApiKey, 'receiving API key'),
      dek,
      params.fundId,
      'receiving_api_key',
    ),
    webhookSecretEncrypted: encryptCredential(
      validSecret(params.webhookSecret, 'webhook signing secret'),
      dek,
      params.fundId,
      'webhook_secret',
    ),
    actorUserId: params.actorUserId,
  })
  if (!updated) throw connectionNotFound()
}

export async function rotateFundEmailWebhookRoute(
  admin: Admin,
  fundId: string,
  actorUserId: string,
  dependencies: CredentialDependencies = {},
): Promise<{ routeToken: string }> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  if (!(await store.getConnectionByFundId(fundId))) throw connectionNotFound()
  const routeToken = (
    dependencies.generateRouteToken ?? generateFundEmailRouteToken
  )()
  assertRouteToken(routeToken)
  const updated = await store.updateRouteHash(
    fundId,
    hashFundEmailRouteToken(routeToken),
    actorUserId,
  )
  if (!updated) throw connectionNotFound()
  return { routeToken }
}

export async function loadFundEmailConnection(
  admin: Admin,
  fundId: string,
  dependencies: CredentialDependencies = {},
): Promise<FundEmailConnection | null> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const row = await store.getConnectionByFundId(fundId)
  if (
    !row ||
    row.status !== 'enabled' ||
    !row.sendingApiKeyEncrypted ||
    !row.receivingApiKeyEncrypted ||
    !row.webhookSecretEncrypted
  )
    return null
  return decryptConnection(store, row)
}

export async function loadReadyFundEmailSendingConnection(
  admin: Admin,
  fundId: string,
  dependencies: CredentialDependencies = {},
): Promise<FundEmailSendingConnection | null> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const row = await store.getConnectionByFundId(fundId)
  if (
    !row ||
    row.status !== 'enabled' ||
    row.domainStatus !== 'verified' ||
    row.sendingStatus === 'failed' ||
    !row.sendingApiKeyEncrypted
  )
    return null
  return decryptSendingConnection(store, row)
}

export async function loadReadyFundEmailIdentity(
  admin: Admin,
  fundId: string,
  dependencies: CredentialDependencies = {},
): Promise<FundEmailIdentityConnection | null> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const row = await store.getConnectionByFundId(fundId)
  if (!row || row.status !== 'enabled') return null
  await validatedConnectionState(store, row)
  return { id: row.id, fundId: row.fundId, domain: row.domain }
}

export async function loadFundEmailReceivingConfiguration(
  admin: Admin,
  fundId: string,
  dependencies: CredentialDependencies = {},
): Promise<FundEmailReceivingConfiguration | null> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const row = await store.getConnectionByFundId(fundId)
  if (
    !row ||
    row.status !== 'enabled' ||
    !row.receivingApiKeyEncrypted ||
    !row.webhookSecretEncrypted ||
    !row.routeTokenHash
  )
    return null
  return decryptReceivingConnection(store, row)
}

export async function loadFundEmailReceivingConfigurationForAdmin(
  admin: Admin,
  fundId: string,
  dependencies: CredentialDependencies = {},
): Promise<FundEmailReceivingConfiguration | null> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const row = await store.getConnectionByFundId(fundId)
  if (
    !row ||
    !row.receivingApiKeyEncrypted ||
    !row.webhookSecretEncrypted ||
    !row.routeTokenHash
  )
    return null
  return decryptReceivingConnection(store, row)
}

export async function resolveFundEmailConnectionByRouteToken(
  admin: Admin,
  routeToken: string,
  dependencies: CredentialDependencies = {},
): Promise<FundEmailConnection | null> {
  assertRouteToken(routeToken)
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const row = await store.getConnectionByRouteHash(
    hashFundEmailRouteToken(routeToken),
  )
  if (
    !row ||
    row.status !== 'enabled' ||
    !row.sendingApiKeyEncrypted ||
    !row.receivingApiKeyEncrypted ||
    !row.webhookSecretEncrypted
  )
    return null
  return decryptConnection(store, row)
}

export async function resolveVerifiedFundEmailReceivingConnectionByRouteToken(
  admin: Admin,
  routeToken: string,
  dependencies: CredentialDependencies = {},
): Promise<FundEmailReceivingConfiguration | null> {
  assertRouteToken(routeToken)
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const row = await store.getConnectionByRouteHash(
    hashFundEmailRouteToken(routeToken),
  )
  if (
    !row ||
    row.status !== 'enabled' ||
    row.domainStatus !== 'verified' ||
    row.receivingStatus !== 'verified' ||
    !row.receivingApiKeyEncrypted ||
    !row.webhookSecretEncrypted ||
    !row.routeTokenHash
  )
    return null
  return decryptReceivingConnection(store, row)
}

export async function getFundEmailConnectionStatus(
  admin: Admin,
  fundId: string,
  dependencies: CredentialDependencies = {},
): Promise<FundEmailConnectionStatus> {
  const store =
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  const [state, row] = await Promise.all([
    store.getFundSecurityState(fundId),
    store.getConnectionByFundId(fundId),
  ])
  if (!state) throw new FundEmailError('fund_not_found', 'Fund not found.', 404)
  if (!row) {
    return {
      configured: false,
      emailSubdomain: state.emailSubdomain,
      domain: state.emailSubdomain
        ? deriveFundEmailDomain(state.emailSubdomain)
        : null,
      status: 'not_configured',
      domainStatus: null,
      sendingStatus: null,
      receivingStatus: null,
      sendingConfigured: Boolean(state.resendApiKeyConfigured),
      receivingConfigured: false,
      webhookConfigured: false,
      webhookManaged: false,
      lastVerifiedAt: null,
      lastErrorCode: null,
      createdAt: null,
      updatedAt: null,
    }
  }
  return {
    configured: true,
    emailSubdomain: state.emailSubdomain,
    domain: row.domain,
    status: row.status,
    domainStatus: row.domainStatus,
    sendingStatus: row.sendingStatus,
    receivingStatus: row.receivingStatus,
    sendingConfigured: Boolean(
      state.resendApiKeyConfigured || row.sendingApiKeyEncrypted,
    ),
    receivingConfigured: Boolean(row.receivingApiKeyEncrypted),
    webhookConfigured: Boolean(
      row.receivingApiKeyEncrypted &&
      row.webhookSecretEncrypted &&
      row.routeTokenHash,
    ),
    webhookManaged: Boolean(row.providerWebhookId),
    lastVerifiedAt: row.lastVerifiedAt,
    lastErrorCode: row.lastErrorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function deleteFundEmailConnection(
  admin: Admin,
  fundId: string,
  dependencies: CredentialDependencies = {},
): Promise<boolean> {
  return (
    dependencies.store ?? createSupabaseFundEmailCredentialStore(admin)
  ).deleteConnection(fundId)
}

export async function beginFundEmailConnectionDelete(
  admin: Admin,
  params: {
    fundId: string
    actorUserId: string
    expectedProviderWebhookId: string | null
    expectedUpdatedAt: string
  },
): Promise<string | null> {
  const result = await admin.rpc('fund_email_begin_delete', {
    p_fund_id: params.fundId,
    p_actor_user_id: params.actorUserId,
    p_expected_provider_webhook_id: params.expectedProviderWebhookId,
    p_expected_updated_at: params.expectedUpdatedAt,
  })
  if (result.error) throw storageUnavailable()
  return typeof result.data === 'string' ? result.data : null
}

export async function finalizeFundEmailConnectionDelete(
  admin: Admin,
  params: {
    fundId: string
    expectedProviderWebhookId: string | null
    expectedUpdatedAt: string
  },
): Promise<boolean> {
  const result = await admin.rpc('fund_email_finalize_delete', {
    p_fund_id: params.fundId,
    p_expected_provider_webhook_id: params.expectedProviderWebhookId,
    p_expected_updated_at: params.expectedUpdatedAt,
  })
  if (result.error) throw storageUnavailable()
  return result.data === true
}

export async function beginFundEmailReceivingDisconnect(
  admin: Admin,
  params: {
    fundId: string
    actorUserId: string
    expectedProviderWebhookId: string | null
    expectedUpdatedAt: string
  },
): Promise<string | null> {
  const result = await admin.rpc('fund_email_begin_receiving_disconnect', {
    p_fund_id: params.fundId,
    p_actor_user_id: params.actorUserId,
    p_expected_provider_webhook_id: params.expectedProviderWebhookId,
    p_expected_updated_at: params.expectedUpdatedAt,
  })
  if (result.error) throw storageUnavailable()
  return typeof result.data === 'string' ? result.data : null
}

export async function finalizeFundEmailReceivingDisconnect(
  admin: Admin,
  params: {
    fundId: string
    actorUserId: string
    expectedProviderWebhookId: string | null
    expectedUpdatedAt: string
  },
): Promise<boolean> {
  const result = await admin.rpc('fund_email_finalize_receiving_disconnect', {
    p_fund_id: params.fundId,
    p_actor_user_id: params.actorUserId,
    p_expected_provider_webhook_id: params.expectedProviderWebhookId,
    p_expected_updated_at: params.expectedUpdatedAt,
  })
  if (result.error) throw storageUnavailable()
  return result.data === true
}

async function decryptConnection(
  store: FundEmailCredentialStore,
  row: StoredFundEmailConnection,
): Promise<FundEmailConnection> {
  if (
    !row.sendingApiKeyEncrypted ||
    !row.receivingApiKeyEncrypted ||
    !row.webhookSecretEncrypted
  ) {
    throw credentialUnavailable()
  }
  const state = await requiredFundState(store, row.fundId)
  if (
    !state.emailSubdomain ||
    deriveFundEmailDomain(state.emailSubdomain) !== row.domain
  ) {
    throw credentialUnavailable()
  }
  const dek = await loadFundDek(state)
  try {
    return {
      id: row.id,
      fundId: row.fundId,
      domain: row.domain,
      sendingApiKeyEncrypted: row.sendingApiKeyEncrypted,
      sendingApiKey: decryptCredential(
        row.sendingApiKeyEncrypted,
        dek,
        row.fundId,
        'sending_api_key',
      ),
      receivingApiKey: decryptCredential(
        row.receivingApiKeyEncrypted,
        dek,
        row.fundId,
        'receiving_api_key',
      ),
      webhookSecret: decryptCredential(
        row.webhookSecretEncrypted,
        dek,
        row.fundId,
        'webhook_secret',
      ),
    }
  } catch {
    throw credentialUnavailable()
  }
}

async function decryptSendingConnection(
  store: FundEmailCredentialStore,
  row: StoredFundEmailConnection,
): Promise<FundEmailSendingConnection> {
  if (!row.sendingApiKeyEncrypted) throw credentialUnavailable()
  const state = await validatedConnectionState(store, row)
  const dek = await loadFundDek(state)
  try {
    return {
      id: row.id,
      fundId: row.fundId,
      domain: row.domain,
      sendingApiKeyEncrypted: row.sendingApiKeyEncrypted,
      sendingApiKey: decryptCredential(
        row.sendingApiKeyEncrypted,
        dek,
        row.fundId,
        'sending_api_key',
      ),
    }
  } catch {
    throw credentialUnavailable()
  }
}

async function decryptReceivingConnection(
  store: FundEmailCredentialStore,
  row: StoredFundEmailConnection,
): Promise<FundEmailReceivingConfiguration> {
  if (
    !row.receivingApiKeyEncrypted ||
    !row.webhookSecretEncrypted ||
    !row.routeTokenHash
  ) {
    throw credentialUnavailable()
  }
  const state = await validatedConnectionState(store, row)
  const dek = await loadFundDek(state)
  try {
    return {
      id: row.id,
      fundId: row.fundId,
      domain: row.domain,
      receivingApiKey: decryptCredential(
        row.receivingApiKeyEncrypted,
        dek,
        row.fundId,
        'receiving_api_key',
      ),
      webhookSecret: decryptCredential(
        row.webhookSecretEncrypted,
        dek,
        row.fundId,
        'webhook_secret',
      ),
      providerWebhookId: row.providerWebhookId,
      routeTokenHash: row.routeTokenHash,
      updatedAt: row.updatedAt,
    }
  } catch {
    throw credentialUnavailable()
  }
}

async function validatedConnectionState(
  store: FundEmailCredentialStore,
  row: StoredFundEmailConnection,
): Promise<FundEmailSecurityState> {
  const state = await requiredFundState(store, row.fundId)
  if (
    !state.emailSubdomain ||
    deriveFundEmailDomain(state.emailSubdomain) !== row.domain
  ) {
    throw credentialUnavailable()
  }
  return state
}

async function getOrCreateFundDek(
  store: FundEmailCredentialStore,
  fundId: string,
  initialState: FundEmailSecurityState,
): Promise<string> {
  if (initialState.encryptionKeyEncrypted) return loadFundDek(initialState)
  const kek = encryptionKey()
  const candidate = randomBytes(32).toString('hex')
  const storedEnvelope = await store.compareAndSetFundDek(
    fundId,
    encrypt(candidate, kek),
  )
  if (!storedEnvelope)
    throw new FundEmailError('fund_not_found', 'Fund not found.', 404)
  try {
    return decrypt(storedEnvelope, kek)
  } catch {
    throw credentialUnavailable()
  }
}

async function loadFundDek(state: FundEmailSecurityState): Promise<string> {
  if (!state.encryptionKeyEncrypted) throw credentialUnavailable()
  try {
    return decrypt(state.encryptionKeyEncrypted, encryptionKey())
  } catch (error) {
    if (error instanceof FundEmailError) throw error
    throw credentialUnavailable()
  }
}

async function requiredFundState(
  store: FundEmailCredentialStore,
  fundId: string,
): Promise<FundEmailSecurityState> {
  const state = await store.getFundSecurityState(fundId)
  if (!state) throw new FundEmailError('fund_not_found', 'Fund not found.', 404)
  return state
}

function encryptCredential(
  value: string,
  dek: string,
  fundId: string,
  field: CredentialField,
): string {
  return `${CIPHERTEXT_VERSION}:${encrypt(value, dek, credentialAssociatedData(fundId, field))}`
}

function decryptCredential(
  value: string,
  dek: string,
  fundId: string,
  field: CredentialField,
): string {
  const prefix = `${CIPHERTEXT_VERSION}:`
  if (!value.startsWith(prefix)) throw credentialUnavailable()
  return decrypt(
    value.slice(prefix.length),
    dek,
    credentialAssociatedData(fundId, field),
  )
}

function validSecret(value: string, label: string): string {
  const secret = value.trim()
  if (!secret || secret.length > 2048 || /[\r\n\0]/.test(secret)) {
    throw new FundEmailError(
      'invalid_configuration',
      `A valid Resend ${label} is required.`,
    )
  }
  return secret
}

function validProviderWebhookId(value: string): string {
  const id = value.trim()
  if (!id || id.length > 200 || /[\r\n\0]/.test(id)) {
    throw new FundEmailError(
      'invalid_configuration',
      'A valid Resend webhook ID is required.',
    )
  }
  return id
}

function assertCompatibleStagedConnection(
  state: FundEmailSecurityState,
  existing: StoredFundEmailConnection | null,
  slug: string,
  domain: string,
): void {
  if (state.emailSubdomain && state.emailSubdomain !== slug) {
    throw new FundEmailError(
      'connection_conflict',
      'This Fund already has a different email slug.',
      409,
    )
  }
  if (existing && existing.domain !== domain) {
    throw new FundEmailError(
      'connection_conflict',
      'This Fund already has a different email domain.',
      409,
    )
  }
}

function assertRouteToken(value: string): void {
  if (
    value.length < 40 ||
    value.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new FundEmailError(
      'invalid_configuration',
      'A secure webhook route token is required.',
      500,
    )
  }
}

function encryptionKey(): string {
  const value = process.env.ENCRYPTION_KEY?.trim()
  if (!value) {
    throw new FundEmailError(
      'encryption_unavailable',
      'Fund email encryption is not configured.',
      500,
    )
  }
  return value
}

function credentialUnavailable(): FundEmailError {
  return new FundEmailError(
    'credential_unavailable',
    'Fund email credentials are unavailable.',
    503,
  )
}

function connectionNotFound(): FundEmailError {
  return new FundEmailError(
    'connection_not_found',
    'Fund email is not configured.',
    404,
  )
}

export function createSupabaseFundEmailCredentialStore(
  admin: SupabaseClient<Database>,
): FundEmailCredentialStore {
  return {
    async getFundSecurityState(fundId) {
      const [fundResult, settingsResult] = await Promise.all([
        admin
          .from('funds')
          .select('email_subdomain')
          .eq('id', fundId)
          .maybeSingle(),
        admin
          .from('fund_settings')
          .select('encryption_key_encrypted,resend_api_key_encrypted')
          .eq('fund_id', fundId)
          .maybeSingle(),
      ])
      if (fundResult.error || settingsResult.error) throw storageUnavailable()
      if (!fundResult.data) return null
      return {
        emailSubdomain: fundResult.data.email_subdomain ?? null,
        encryptionKeyEncrypted:
          settingsResult.data?.encryption_key_encrypted ?? null,
        resendApiKeyConfigured: Boolean(
          settingsResult.data?.resend_api_key_encrypted,
        ),
      }
    },
    async compareAndSetFundDek(fundId, envelope) {
      const update = await admin
        .from('fund_settings')
        .update({ encryption_key_encrypted: envelope })
        .eq('fund_id', fundId)
        .is('encryption_key_encrypted', null)
        .select('encryption_key_encrypted')
        .maybeSingle()
      if (update.error) throw storageUnavailable()
      if (update.data?.encryption_key_encrypted)
        return update.data.encryption_key_encrypted
      const current = await admin
        .from('fund_settings')
        .select('encryption_key_encrypted')
        .eq('fund_id', fundId)
        .maybeSingle()
      if (current.error) throw storageUnavailable()
      return current.data?.encryption_key_encrypted ?? null
    },
    async setFundEmailSubdomain(fundId, slug) {
      const result = await admin
        .from('funds')
        .update({ email_subdomain: slug })
        .eq('id', fundId)
        .select('id')
        .maybeSingle()
      if (result.error) {
        if (result.error.code === '23505') {
          throw new FundEmailError(
            'connection_conflict',
            'This Fund email slug is unavailable.',
            409,
          )
        }
        throw storageUnavailable()
      }
      if (!result.data)
        throw new FundEmailError('fund_not_found', 'Fund not found.', 404)
    },
    async getConnectionByFundId(fundId) {
      const result = await admin
        .from('fund_email_provider_credentials')
        .select(CONNECTION_COLUMNS)
        .eq('fund_id', fundId)
        .maybeSingle()
      if (result.error) throw storageUnavailable()
      return result.data ? mapConnection(result.data) : null
    },
    async getConnectionByRouteHash(hash) {
      const current = await admin
        .from('fund_email_provider_credentials')
        .select(CONNECTION_COLUMNS)
        .eq('route_token_hash', hash)
        .maybeSingle()
      if (current.error) throw storageUnavailable()
      if (current.data) return mapConnection(current.data)
      const previous = await admin
        .from('fund_email_provider_credentials')
        .select(CONNECTION_COLUMNS)
        .eq('previous_route_token_hash', hash)
        .gt('previous_route_expires_at', new Date().toISOString())
        .maybeSingle()
      if (previous.error) throw storageUnavailable()
      return previous.data ? mapConnection(previous.data) : null
    },
    async configureIdentity(input) {
      const result = await admin.rpc('fund_email_configure_identity', {
        p_fund_id: input.fundId,
        p_slug: input.slug,
        p_domain: input.domain,
        p_actor_user_id: input.actorUserId,
      })
      if (result.error) throw mapConfigurationStorageError(result.error.code)
    },
    async configureSending(input) {
      const result = await admin.rpc('fund_email_configure_sending', {
        p_fund_id: input.fundId,
        p_slug: input.slug,
        p_domain: input.domain,
        p_sending_api_key_encrypted: input.sendingApiKeyEncrypted,
        p_actor_user_id: input.actorUserId,
      })
      if (result.error) throw mapConfigurationStorageError(result.error.code)
    },
    async configureReceiving(input) {
      const result = await admin.rpc('fund_email_configure_receiving', {
        p_fund_id: input.fundId,
        p_slug: input.slug,
        p_domain: input.domain,
        p_receiving_api_key_encrypted: input.receivingApiKeyEncrypted,
        p_webhook_secret_encrypted: input.webhookSecretEncrypted,
        p_route_token_hash: input.routeTokenHash,
        p_provider_webhook_id: input.providerWebhookId,
        p_expected_provider_webhook_id: input.expectedProviderWebhookId,
        p_expected_updated_at: input.expectedUpdatedAt,
        p_provider_domain_id: input.inspection.providerDomainId,
        p_domain_status: input.inspection.domainStatus,
        p_sending_status: input.inspection.sendingStatus,
        p_receiving_status: input.inspection.receivingStatus,
        p_dns_records: input.inspection.dnsRecords as unknown as Json,
        p_last_error_code: input.inspection.lastErrorCode,
        p_actor_user_id: input.actorUserId,
      })
      if (result.error) throw mapConfigurationStorageError(result.error.code)
    },
    async createConnection(input) {
      const result = await admin.rpc('fund_email_create_connection', {
        p_fund_id: input.fundId,
        p_slug: input.slug,
        p_domain: input.domain,
        p_sending_api_key_encrypted: input.sendingApiKeyEncrypted,
        p_receiving_api_key_encrypted: input.receivingApiKeyEncrypted,
        p_webhook_secret_encrypted: input.webhookSecretEncrypted,
        p_route_token_hash: input.routeTokenHash,
        p_actor_user_id: input.actorUserId,
      })
      if (result.error) {
        if (result.error.code === '23505') {
          throw new FundEmailError(
            'connection_conflict',
            'Fund email is already configured.',
            409,
          )
        }
        if (result.error.code === '23503') {
          throw new FundEmailError('fund_not_found', 'Fund not found.', 404)
        }
        throw storageUnavailable()
      }
    },
    async upsertConnection(input) {
      const result = await admin
        .from('fund_email_provider_credentials')
        .insert({
          fund_id: input.fundId,
          domain: input.domain,
          sending_api_key_encrypted: input.sendingApiKeyEncrypted,
          receiving_api_key_encrypted: input.receivingApiKeyEncrypted,
          webhook_secret_encrypted: input.webhookSecretEncrypted,
          route_token_hash: input.routeTokenHash,
          created_by: input.actorUserId,
          updated_by: input.actorUserId,
        })
      if (result.error) {
        if (result.error.code === '23505')
          throw new FundEmailError(
            'connection_conflict',
            'Fund email is already configured.',
            409,
          )
        throw storageUnavailable()
      }
    },
    async updateSecrets(fundId, values) {
      const result = await admin
        .from('fund_email_provider_credentials')
        .update({
          sending_api_key_encrypted: values.sendingApiKeyEncrypted,
          receiving_api_key_encrypted: values.receivingApiKeyEncrypted,
          webhook_secret_encrypted: values.webhookSecretEncrypted,
          updated_by: values.actorUserId,
          last_error_code: null,
        })
        .eq('fund_id', fundId)
        .select('id')
        .maybeSingle()
      if (result.error) throw storageUnavailable()
      return Boolean(result.data)
    },
    async updateRouteHash(fundId, routeTokenHash, actorUserId) {
      const result = await admin.rpc('fund_email_rotate_webhook_route', {
        p_fund_id: fundId,
        p_route_token_hash: routeTokenHash,
        p_actor_user_id: actorUserId,
        p_overlap_seconds: 900,
      })
      if (result.error) throw storageUnavailable()
      return result.data === true
    },
    async deleteConnection(fundId) {
      const result = await admin
        .from('fund_email_provider_credentials')
        .delete()
        .eq('fund_id', fundId)
      if (result.error) throw storageUnavailable()
      return true
    },
    async ensureReservedMailboxes(fundId) {
      const result = await admin.rpc('fund_email_ensure_reserved_mailboxes', {
        p_fund_id: fundId,
      })
      if (result.error) throw storageUnavailable()
    },
  }
}

const CONNECTION_COLUMNS =
  'id,fund_id,domain,sending_api_key_encrypted,receiving_api_key_encrypted,webhook_secret_encrypted,route_token_hash,provider_webhook_id,previous_route_token_hash,previous_route_expires_at,status,domain_status,sending_status,receiving_status,last_verified_at,last_error_code,created_at,updated_at' as const

type ConnectionProjection = Pick<
  Database['public']['Tables']['fund_email_provider_credentials']['Row'],
  | 'id'
  | 'fund_id'
  | 'domain'
  | 'sending_api_key_encrypted'
  | 'receiving_api_key_encrypted'
  | 'webhook_secret_encrypted'
  | 'route_token_hash'
  | 'provider_webhook_id'
  | 'previous_route_token_hash'
  | 'previous_route_expires_at'
  | 'status'
  | 'domain_status'
  | 'sending_status'
  | 'receiving_status'
  | 'last_verified_at'
  | 'last_error_code'
  | 'created_at'
  | 'updated_at'
>

function mapConnection(row: ConnectionProjection): StoredFundEmailConnection {
  return {
    id: row.id,
    fundId: row.fund_id,
    domain: row.domain,
    sendingApiKeyEncrypted: row.sending_api_key_encrypted,
    receivingApiKeyEncrypted: row.receiving_api_key_encrypted,
    webhookSecretEncrypted: row.webhook_secret_encrypted,
    routeTokenHash: row.route_token_hash,
    providerWebhookId: row.provider_webhook_id,
    previousRouteTokenHash: row.previous_route_token_hash ?? null,
    previousRouteExpiresAt: row.previous_route_expires_at ?? null,
    status: assertConnectionStatus(row.status),
    domainStatus: assertCapabilityStatus(row.domain_status),
    sendingStatus: assertCapabilityStatus(row.sending_status),
    receivingStatus: assertCapabilityStatus(row.receiving_status),
    lastVerifiedAt: row.last_verified_at,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapConfigurationStorageError(
  code: string | undefined,
): FundEmailError {
  if (code === '40001') {
    return new FundEmailError(
      'connection_conflict',
      'Fund email webhook changed concurrently. Refresh and try again.',
      409,
    )
  }
  if (code === '23505') {
    return new FundEmailError(
      'connection_conflict',
      'This Fund email configuration conflicts with an existing domain.',
      409,
    )
  }
  if (code === '23503')
    return new FundEmailError('fund_not_found', 'Fund not found.', 404)
  return storageUnavailable()
}

function assertConnectionStatus(
  value: string,
): StoredFundEmailConnection['status'] {
  if (value === 'enabled' || value === 'disabled' || value === 'error')
    return value
  throw storageUnavailable()
}

function assertCapabilityStatus(
  value: string,
): StoredFundEmailConnection['domainStatus'] {
  if (value === 'pending' || value === 'verified' || value === 'failed')
    return value
  throw storageUnavailable()
}

function storageUnavailable(): FundEmailError {
  return new FundEmailError(
    'storage_unavailable',
    'Fund email storage is unavailable.',
    503,
  )
}
