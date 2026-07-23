import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureMinifluxConnection } from '@/lib/feeds/provisioning'
import { MinifluxClient } from '@/lib/feeds/miniflux/client'
import {
  approveFundJoinRequest,
  claimFundJoinRequestApproval,
  rejectFundJoinRequest,
  releaseFundJoinRequestApproval,
} from '@/lib/members/approval'

const enabled = process.env.REPORTING_MINIFLUX_APPROVAL_INTEGRATION === 'true'
if (enabled) loadIntegrationEnvironment()
const created = {
  approverId: null as string | null,
  targetId: null as string | null,
  staleTargetId: null as string | null,
  revokedTargetId: null as string | null,
  fundId: null as string | null,
  minifluxUserId: null as number | null,
}

describe.runIf(enabled)('Reporting approval to Miniflux integration', () => {
  it('provisions a personal Miniflux identity before atomically approving membership', async () => {
    const admin = createAdminClient()
    const suffix = randomUUID()
    const password = `Integration-${randomUUID()}!`
    const approver = await admin.auth.admin.createUser({
      email: `approval-admin-${suffix}@example.invalid`, password, email_confirm: true,
    })
    const target = await admin.auth.admin.createUser({
      email: `approval-target-${suffix}@example.invalid`, password, email_confirm: true,
    })
    if (approver.error || !approver.data.user || target.error || !target.data.user) {
      throw new Error('Unable to create disposable Reporting users')
    }
    created.approverId = approver.data.user.id
    created.targetId = target.data.user.id

    const fund = await admin.from('funds').insert({
      name: `Approval integration ${suffix}`,
      created_by: created.approverId,
    }).select('id').single()
    if (fund.error || !fund.data) throw new Error('Unable to create disposable fund')
    created.fundId = fund.data.id

    const request = await admin.from('fund_join_requests').insert({
      fund_id: created.fundId,
      user_id: created.targetId,
      email: `approval-target-${suffix}@example.invalid`,
    }).select('id').single()
    if (request.error || !request.data) throw new Error('Unable to create disposable join request')

    const claimId = randomUUID()
    await expect(claimFundJoinRequestApproval(admin, {
      requestId: request.data.id,
      fundId: created.fundId,
      reviewedBy: created.approverId,
      claimId,
    })).resolves.toBe(true)

    const concurrent = await Promise.allSettled([
      ensureMinifluxConnection(admin, created.targetId),
      ensureMinifluxConnection(admin, created.targetId),
    ])
    expect(concurrent.some(result => result.status === 'fulfilled')).toBe(true)
    const provisioned = await ensureMinifluxConnection(admin, created.targetId)
    created.minifluxUserId = provisioned.externalUserId
    await approveFundJoinRequest(admin, {
      requestId: request.data.id,
      fundId: created.fundId,
      reviewedBy: created.approverId,
      claimId,
    })

    const [membership, approved, credential] = await Promise.all([
      admin.from('fund_members').select('role').eq('fund_id', created.fundId).eq('user_id', created.targetId).single(),
      admin.from('fund_join_requests').select('status').eq('id', request.data.id).single(),
      (admin as any).from('miniflux_connections').select('api_token_encrypted').eq('user_id', created.targetId).single(),
    ])
    expect(membership.data?.role).toBe('member')
    expect(approved.data?.status).toBe('approved')
    expect(credential.data?.api_token_encrypted).not.toBeFalsy()

    const stored = await import('@/lib/feeds/credentials').then(module => module.getMinifluxCredential(admin, created.targetId!))
    expect(stored).not.toBeNull()
    await expect(new MinifluxClient({
      baseUrl: required('MINIFLUX_BASE_URL'), apiKey: stored!.apiToken,
    }).verifyConnection()).resolves.toMatchObject({ id: provisioned.externalUserId, isAdmin: false })
  })

  it('recovers a stale approval claim and prevents rejection during active provisioning', async () => {
    const admin = createAdminClient()
    const suffix = randomUUID()
    const target = await admin.auth.admin.createUser({
      email: `approval-stale-${suffix}@example.invalid`,
      password: `Integration-${randomUUID()}!`,
      email_confirm: true,
    })
    if (target.error || !target.data.user || !created.fundId || !created.approverId) {
      throw new Error('Unable to create stale-claim test data')
    }
    created.staleTargetId = target.data.user.id
    const request = await admin.from('fund_join_requests').insert({
      fund_id: created.fundId,
      user_id: created.staleTargetId,
      email: `approval-stale-${suffix}@example.invalid`,
    }).select('id').single()
    if (request.error || !request.data) throw new Error('Unable to create stale-claim request')

    const firstClaimId = randomUUID()
    await expect(claimFundJoinRequestApproval(admin, {
      requestId: request.data.id,
      fundId: created.fundId,
      reviewedBy: created.approverId,
      claimId: firstClaimId,
    })).resolves.toBe(true)

    const stale = await (admin as any).from('fund_join_requests')
      .update({ approval_claimed_at: new Date(Date.now() - 3 * 60 * 1000).toISOString() })
      .eq('id', request.data.id)
    if (stale.error) throw new Error('Unable to age the disposable approval claim')

    const replacementClaimId = randomUUID()
    await expect(claimFundJoinRequestApproval(admin, {
      requestId: request.data.id,
      fundId: created.fundId,
      reviewedBy: created.approverId,
      claimId: replacementClaimId,
    })).resolves.toBe(true)
    await expect(rejectFundJoinRequest(admin, {
      requestId: request.data.id,
      fundId: created.fundId,
      reviewedBy: created.approverId,
    })).resolves.toBe(false)

    await releaseFundJoinRequestApproval(admin, {
      requestId: request.data.id,
      claimId: replacementClaimId,
    })
    await expect(rejectFundJoinRequest(admin, {
      requestId: request.data.id,
      fundId: created.fundId,
      reviewedBy: created.approverId,
    })).resolves.toBe(true)
    const rejected = await admin.from('fund_join_requests').select('status').eq('id', request.data.id).single()
    expect(rejected.data?.status).toBe('rejected')
  })

  it('refuses the final approval if the approver lost admin rights during provisioning', async () => {
    const admin = createAdminClient()
    const suffix = randomUUID()
    const target = await admin.auth.admin.createUser({
      email: `approval-revoked-${suffix}@example.invalid`,
      password: `Integration-${randomUUID()}!`,
      email_confirm: true,
    })
    if (target.error || !target.data.user || !created.fundId || !created.approverId) {
      throw new Error('Unable to create revoked-approver test data')
    }
    created.revokedTargetId = target.data.user.id
    const request = await admin.from('fund_join_requests').insert({
      fund_id: created.fundId,
      user_id: created.revokedTargetId,
      email: `approval-revoked-${suffix}@example.invalid`,
    }).select('id').single()
    if (request.error || !request.data) throw new Error('Unable to create revoked-approver request')

    const claimId = randomUUID()
    await expect(claimFundJoinRequestApproval(admin, {
      requestId: request.data.id,
      fundId: created.fundId,
      reviewedBy: created.approverId,
      claimId,
    })).resolves.toBe(true)
    await admin.from('fund_members').delete()
      .eq('fund_id', created.fundId)
      .eq('user_id', created.approverId)

    await expect(approveFundJoinRequest(admin, {
      requestId: request.data.id,
      fundId: created.fundId,
      reviewedBy: created.approverId,
      claimId,
    })).rejects.toThrow('Unable to approve fund join request')
    const membership = await admin.from('fund_members').select('id')
      .eq('fund_id', created.fundId)
      .eq('user_id', created.revokedTargetId)
      .maybeSingle()
    expect(membership.data).toBeNull()
    await releaseFundJoinRequestApproval(admin, { requestId: request.data.id, claimId })
  })
})

afterAll(async () => {
  if (!enabled) return
  const admin = createAdminClient()
  if (created.minifluxUserId) {
    const response = await fetch(`${required('MINIFLUX_BASE_URL').replace(/\/+$/, '')}/v1/users/${created.minifluxUserId}`, {
      method: 'DELETE',
      redirect: 'manual',
      headers: { 'X-Auth-Token': await provisionerToken() },
    })
    if (!response.ok && response.status !== 404) throw new Error(`Disposable Miniflux cleanup failed: ${response.status}`)
  }
  if (created.targetId) await (admin as any).from('miniflux_connections').delete().eq('user_id', created.targetId)
  if (created.fundId) await admin.from('funds').delete().eq('id', created.fundId)
  if (created.targetId) await admin.auth.admin.deleteUser(created.targetId)
  if (created.staleTargetId) await admin.auth.admin.deleteUser(created.staleTargetId)
  if (created.revokedTargetId) await admin.auth.admin.deleteUser(created.revokedTargetId)
  if (created.approverId) await admin.auth.admin.deleteUser(created.approverId)
})

async function provisionerToken(): Promise<string> {
  const file = required('MINIFLUX_PROVISIONER_TOKEN_FILE')
  const token = (await fs.readFile(file, 'utf8')).trim()
  if (!token) throw new Error('Miniflux provisioner token is required')
  return token
}

function loadIntegrationEnvironment(): void {
  const allowed = new Set([
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ENCRYPTION_KEY',
    'MINIFLUX_BASE_URL',
    'MINIFLUX_ALLOW_INSECURE_HTTP',
    'MINIFLUX_PROVISIONER_TOKEN_FILE',
  ])
  for (const rawLine of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!allowed.has(key) || process.env[key]) continue
    process.env[key] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}
