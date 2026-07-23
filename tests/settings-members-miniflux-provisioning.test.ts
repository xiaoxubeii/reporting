import { beforeEach, describe, expect, it, vi } from 'vitest'

const ensureMinifluxConnection = vi.hoisted(() => vi.fn())
const automaticMinifluxProvisioningEnabled = vi.hoisted(() => vi.fn(() => true))
const approveFundJoinRequest = vi.hoisted(() => vi.fn())
const claimFundJoinRequestApproval = vi.hoisted(() => vi.fn(async () => true))
const rejectFundJoinRequest = vi.hoisted(() => vi.fn(async () => true))
const releaseFundJoinRequestApproval = vi.hoisted(() => vi.fn(async () => undefined))
const sendApprovalEmail = vi.hoisted(() => vi.fn(async () => undefined))
const getUser = vi.hoisted(() => vi.fn(async () => ({ data: { user: { id: 'approver-1' } } })))

vi.mock('@/lib/feeds/provisioning', () => ({ ensureMinifluxConnection }))
vi.mock('@/lib/feeds/config', () => ({ automaticMinifluxProvisioningEnabled }))
vi.mock('@/lib/members/approval', () => ({
  approveFundJoinRequest,
  claimFundJoinRequestApproval,
  rejectFundJoinRequest,
  releaseFundJoinRequestApproval,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin }))
vi.mock('@/lib/api-helpers', () => ({ assertWriteAccess: vi.fn(async () => ({ fundId: 'fund-1' })) }))
vi.mock('@/lib/email', () => ({ sendApprovalEmail }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

let requestStatus = 'pending'

const fakeAdmin: any = {
  from(table: string) {
    if (table === 'fund_members') {
      return query({ fund_id: 'fund-1', role: 'admin' })
    }
    if (table === 'fund_join_requests') {
      return query({
        id: 'request-1', fund_id: 'fund-1', user_id: 'target-user-1', email: 'member@example.com',
        status: requestStatus, funds: { name: 'Example Fund' },
      })
    }
    throw new Error(`Unexpected table: ${table}`)
  },
}

function query(data: unknown) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    maybeSingle: async () => ({ data, error: null }),
    single: async () => ({ data, error: null }),
  }
  return builder
}

async function patch(action: 'approve' | 'reject') {
  const { PATCH } = await import('@/app/api/settings/members/[id]/route')
  const request = new Request('https://app.test/api/settings/members/request-1', {
    method: 'PATCH', body: JSON.stringify({ action }),
  })
  const response = await PATCH(request as never, { params: { id: 'request-1' } })
  return { response, body: await response.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  requestStatus = 'pending'
  ensureMinifluxConnection.mockResolvedValue({ externalUserId: 44, username: 'reporting_reader' })
  approveFundJoinRequest.mockResolvedValue(undefined)
  claimFundJoinRequestApproval.mockResolvedValue(true)
  rejectFundJoinRequest.mockResolvedValue(true)
  releaseFundJoinRequestApproval.mockResolvedValue(undefined)
})

describe('Reporting member approval provisions Miniflux', () => {
  it('provisions the target user before atomically approving membership', async () => {
    const order: string[] = []
    claimFundJoinRequestApproval.mockImplementation(async () => { order.push('claim'); return true })
    ensureMinifluxConnection.mockImplementation(async () => { order.push('provision') })
    approveFundJoinRequest.mockImplementation(async () => { order.push('approve') })

    const { response, body } = await patch('approve')

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(ensureMinifluxConnection).toHaveBeenCalledWith(fakeAdmin, 'target-user-1')
    expect(claimFundJoinRequestApproval).toHaveBeenCalledWith(fakeAdmin, expect.objectContaining({
      requestId: 'request-1', fundId: 'fund-1', reviewedBy: 'approver-1',
    }))
    expect(approveFundJoinRequest).toHaveBeenCalledWith(fakeAdmin, expect.objectContaining({
      requestId: 'request-1', fundId: 'fund-1', reviewedBy: 'approver-1',
    }))
    expect(order).toEqual(['claim', 'provision', 'approve'])
  })

  it('keeps the join request pending when Miniflux provisioning fails', async () => {
    ensureMinifluxConnection.mockRejectedValue(new Error('upstream secret failure'))

    const { response, body } = await patch('approve')

    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(body.error).not.toContain('upstream secret failure')
    expect(approveFundJoinRequest).not.toHaveBeenCalled()
    expect(releaseFundJoinRequestApproval).toHaveBeenCalledWith(fakeAdmin, expect.objectContaining({ requestId: 'request-1' }))
    expect(requestStatus).toBe('pending')
  })

  it('does not provision Miniflux when a join request is rejected', async () => {
    const { response } = await patch('reject')

    expect(response.status).toBe(200)
    expect(ensureMinifluxConnection).not.toHaveBeenCalled()
    expect(claimFundJoinRequestApproval).not.toHaveBeenCalled()
    expect(rejectFundJoinRequest).toHaveBeenCalledWith(fakeAdmin, {
      requestId: 'request-1', fundId: 'fund-1', reviewedBy: 'approver-1',
    })
  })

  it('does not reject a request while its approval is being provisioned', async () => {
    requestStatus = 'provisioning'
    rejectFundJoinRequest.mockResolvedValue(false)

    const { response } = await patch('reject')

    expect(response.status).toBe(409)
    expect(ensureMinifluxConnection).not.toHaveBeenCalled()
  })

  it('does not run a second provisioning flow for an already claimed approval', async () => {
    claimFundJoinRequestApproval.mockResolvedValue(false)

    const { response } = await patch('approve')

    expect(response.status).toBe(409)
    expect(ensureMinifluxConnection).not.toHaveBeenCalled()
    expect(approveFundJoinRequest).not.toHaveBeenCalled()
  })
})
