import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMinifluxCredential = vi.hoisted(() => vi.fn())
const assertMinifluxAccountAvailable = vi.hoisted(() => vi.fn())
const saveMinifluxCredential = vi.hoisted(() => vi.fn())
const verifyConnection = vi.hoisted(() => vi.fn())
const provision = vi.hoisted(() => vi.fn())
const loadMinifluxProvisionerToken = vi.hoisted(() => vi.fn(async () => 'provisioner-token'))
const claimMinifluxProvisioningLease = vi.hoisted(() => vi.fn(async () => true))
const releaseMinifluxProvisioningLease = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('./credentials', () => ({
  getMinifluxCredential,
  assertMinifluxAccountAvailable,
  saveMinifluxCredential,
}))
vi.mock('./config', () => ({
  configuredMinifluxBaseUrl: () => 'https://feeds.example.com',
  loadMinifluxProvisionerToken,
}))
vi.mock('./miniflux/client', () => ({ MinifluxClient: class { verifyConnection = verifyConnection } }))
vi.mock('./miniflux/provisioning', () => ({ MinifluxProvisioner: class { provision = provision } }))
vi.mock('./provisioning-lease', () => ({ claimMinifluxProvisioningLease, releaseMinifluxProvisioningLease }))

beforeEach(() => {
  vi.clearAllMocks()
  assertMinifluxAccountAvailable.mockResolvedValue(undefined)
  saveMinifluxCredential.mockResolvedValue(undefined)
  claimMinifluxProvisioningLease.mockResolvedValue(true)
  releaseMinifluxProvisioningLease.mockResolvedValue(undefined)
})

describe('ensureMinifluxConnection', () => {
  it('keeps a valid encrypted personal credential without using the provisioner', async () => {
    getMinifluxCredential.mockResolvedValue({
      apiToken: 'personal-token', externalUserId: 44, username: 'reporting_reader',
    })
    verifyConnection.mockResolvedValue({ id: 44, username: 'reporting_reader', isAdmin: false })
    const { ensureMinifluxConnection } = await import('./provisioning')

    await expect(ensureMinifluxConnection({} as never, 'user-1')).resolves.toEqual({
      externalUserId: 44, username: 'reporting_reader',
    })
    expect(loadMinifluxProvisionerToken).not.toHaveBeenCalled()
    expect(provision).not.toHaveBeenCalled()
    expect(claimMinifluxProvisioningLease).not.toHaveBeenCalled()
  })

  it('reconciles an invalid credential and encrypts the verified managed token', async () => {
    getMinifluxCredential.mockResolvedValue({
      apiToken: 'revoked-token', externalUserId: 44, username: 'reporting_reader',
    })
    verifyConnection.mockRejectedValue(new Error('revoked'))
    provision.mockResolvedValue({ apiToken: 'new-token', externalUserId: 44, username: 'reporting_reader' })
    const { ensureMinifluxConnection } = await import('./provisioning')

    await ensureMinifluxConnection({} as never, 'user-1')

    expect(assertMinifluxAccountAvailable).toHaveBeenCalledWith({}, 'user-1', 44)
    expect(saveMinifluxCredential).toHaveBeenCalledWith({}, {
      userId: 'user-1', apiToken: 'new-token', externalUserId: 44, username: 'reporting_reader',
    })
    expect(releaseMinifluxProvisioningLease).toHaveBeenCalledOnce()
  })

  it('fails safely instead of racing another process holding the user lease', async () => {
    getMinifluxCredential.mockResolvedValue(null)
    claimMinifluxProvisioningLease.mockResolvedValue(false)
    const { ensureMinifluxConnection } = await import('./provisioning')

    const error = await ensureMinifluxConnection({} as never, 'user-1').catch(value => value)

    expect(error).toMatchObject({ code: 'upstream', status: 409 })
    expect(provision).not.toHaveBeenCalled()
    expect(releaseMinifluxProvisioningLease).not.toHaveBeenCalled()
  })
})
