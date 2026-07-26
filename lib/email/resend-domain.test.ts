/* eslint-disable @typescript-eslint/no-explicit-any -- tests inject a minimal Supabase update chain */
import { describe, expect, it, vi } from 'vitest'
import {
  inspectResendFundDomain,
  mergeResendFundDomainRefresh,
  persistResendFundDomainInspection,
} from './resend-domain'

describe('Resend Fund domain inspection', () => {
  it('accepts only the exact configured Fund domain and returns safe DNS/status metadata', async () => {
    const listDomains = vi.fn().mockResolvedValue({
      data: {
        data: [
          { id: 'other', name: 'other.fundworkspace.com' },
          { id: 'domain-1', name: 'cci.fundworkspace.com' },
        ],
        has_more: false,
      },
      error: null,
    })
    const getDomain = vi.fn().mockResolvedValue({
      data: {
        id: 'domain-1',
        name: 'cci.fundworkspace.com',
        status: 'verified',
        capabilities: { sending: 'enabled', receiving: 'enabled' },
        records: [{ record: 'Receiving', type: 'MX', name: 'cci', value: 'inbound-smtp.resend.com', ttl: 'Auto', status: 'verified', priority: 10 }],
      },
      error: null,
    })

    const result = await inspectResendFundDomain(
      'cci.fundworkspace.com',
      're_receiving_secret',
      { listDomains, getDomain },
    )

    expect(result).toEqual({
      providerDomainId: 'domain-1',
      domainStatus: 'verified',
      sendingStatus: 'pending',
      receivingStatus: 'verified',
      lastErrorCode: null,
      dnsRecords: [{
        record: 'Receiving', type: 'MX', name: 'cci', value: 'inbound-smtp.resend.com',
        ttl: 'Auto', status: 'verified', priority: 10,
      }],
    })
    expect(JSON.stringify(result)).not.toContain('re_receiving_secret')
    expect(listDomains).toHaveBeenCalledWith('re_receiving_secret', { limit: 100 })
  })

  it('does not claim a least-privilege sending key is verified before a real send succeeds', async () => {
    const listDomains = vi.fn().mockResolvedValue({
      data: { data: [{ id: 'domain-1', name: 'cci.fundworkspace.com' }], has_more: false },
      error: null,
    })
    const result = await inspectResendFundDomain('cci.fundworkspace.com', 're_receiving', {
      listDomains,
      getDomain: vi.fn().mockResolvedValue({
        data: {
          id: 'domain-1', name: 'cci.fundworkspace.com', status: 'verified',
          capabilities: { sending: 'enabled', receiving: 'enabled' }, records: [],
        },
        error: null,
      }),
    })
    expect(result).toMatchObject({
      domainStatus: 'verified', sendingStatus: 'pending', receivingStatus: 'verified',
    })
  })

  it('rejects a parent, sibling, or absent domain rather than choosing a near match', async () => {
    const listDomains = vi.fn().mockResolvedValue({
      data: {
        data: [{ id: 'parent', name: 'fundworkspace.com' }, { id: 'sibling', name: 'ccii.fundworkspace.com' }],
        has_more: false,
      },
      error: null,
    })

    await expect(inspectResendFundDomain(
      'cci.fundworkspace.com',
      're_receiving_secret',
      { listDomains, getDomain: vi.fn() },
    )).rejects.toMatchObject({ code: 'invalid_domain', status: 400 })
  })

  it('keeps a pending domain pending and fails closed when receiving is disabled', async () => {
    const listDomains = vi.fn().mockResolvedValue({
      data: { data: [{ id: 'domain-1', name: 'cci.fundworkspace.com' }], has_more: false },
      error: null,
    })
    const pending = await inspectResendFundDomain('cci.fundworkspace.com', 're_key', {
      listDomains,
      getDomain: vi.fn().mockResolvedValue({
        data: {
          id: 'domain-1', name: 'cci.fundworkspace.com', status: 'pending',
          capabilities: { sending: 'enabled', receiving: 'enabled' }, records: [],
        },
        error: null,
      }),
    })
    expect(pending).toMatchObject({
      domainStatus: 'pending', sendingStatus: 'pending', receivingStatus: 'pending',
    })

    const disabled = await inspectResendFundDomain('cci.fundworkspace.com', 're_key', {
      listDomains,
      getDomain: vi.fn().mockResolvedValue({
        data: {
          id: 'domain-1', name: 'cci.fundworkspace.com', status: 'verified',
          capabilities: { sending: 'enabled', receiving: 'disabled' }, records: [],
        },
        error: null,
      }),
    })
    expect(disabled).toMatchObject({ receivingStatus: 'failed', lastErrorCode: 'receiving_disabled' })
  })

  it('persists only safe inspection fields for the exact Fund connection', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'connection-1' }, error: null })
    const eq = vi.fn(() => ({ eq, select: () => ({ maybeSingle }) }))
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))

    await persistResendFundDomainInspection({ from } as any, 'fund-1', {
      providerDomainId: 'domain-1',
      domainStatus: 'verified',
      sendingStatus: 'verified',
      receivingStatus: 'verified',
      dnsRecords: [],
      lastErrorCode: null,
    })

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      provider_domain_id: 'domain-1',
      domain_status: 'verified',
      sending_status: 'verified',
      receiving_status: 'verified',
      dns_records: [],
      last_error_code: null,
    }))
    expect(JSON.stringify(update.mock.calls)).not.toMatch(/api_key|webhook_secret|route_token/i)
  })

  it('preserves a previously proven sending key only while the domain remains verified', () => {
    const inspection = {
      providerDomainId: 'domain-1',
      domainStatus: 'verified' as const,
      sendingStatus: 'pending' as const,
      receivingStatus: 'verified' as const,
      dnsRecords: [],
      lastErrorCode: null,
    }
    expect(mergeResendFundDomainRefresh('verified', inspection).sendingStatus).toBe('verified')
    expect(mergeResendFundDomainRefresh('pending', inspection).sendingStatus).toBe('pending')
    expect(mergeResendFundDomainRefresh('verified', {
      ...inspection,
      domainStatus: 'failed',
      sendingStatus: 'failed',
    }).sendingStatus).toBe('failed')
  })
})
