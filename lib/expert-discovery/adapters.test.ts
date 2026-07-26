import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { discoverFromSource } from './adapters'

describe('expert discovery adapters', () => {
  it('normalizes bounded PubMed authors without inventing contact data', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('esearch.fcgi')) return json({ esearchresult: { idlist: ['123'] } })
      return json({ result: { uids: ['123'], 123: {
        uid: '123', title: 'Cardiac AI validation', fulljournalname: 'Heart AI Journal',
        authors: [{ name: 'Ada Zhang' }, { name: 'Bo Li' }],
      } } })
    })
    const results = await discoverFromSource('pubmed', 'cardiac AI', new AbortController().signal, fetcher)
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ name: 'Ada Zhang', organization: null, email: null })
    expect(results[0].evidence[0]).toMatchObject({ sourceId: 'pubmed', recordId: '123' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('normalizes ClinicalTrials.gov officials and preserves source evidence', async () => {
    const fetcher = vi.fn(async () => json({ studies: [{ protocolSection: {
      identificationModule: { nctId: 'NCT12345678', briefTitle: 'AI ECG trial' },
      contactsLocationsModule: {
        overallOfficials: [{ name: 'Chen Wang', affiliation: 'Heart Center', role: 'PRINCIPAL_INVESTIGATOR' }],
        centralContacts: [{ name: 'Lin Zhou', affiliation: 'Heart Center', role: 'CONTACT', email: 'lin.zhou@example.test' }],
      },
      sponsorCollaboratorsModule: { leadSponsor: { name: 'Heart Center' } },
    } }] }))
    const results = await discoverFromSource('clinical_trials', 'AI ECG', new AbortController().signal, fetcher)
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ name: 'Chen Wang', organization: 'Heart Center', title: 'PRINCIPAL_INVESTIGATOR' })
    expect(results[0].evidence[0].url).toBe('https://clinicaltrials.gov/study/NCT12345678')
    expect(results[0].email).toBeNull()
    expect(results[1]).toMatchObject({ name: 'Lin Zhou', email: 'lin.zhou@example.test' })
  })

  it('keeps weak identities record-scoped so same-name clinicians are not silently merged', async () => {
    const fetcher = vi.fn(async () => json({ studies: [{ protocolSection: {
      identificationModule: { nctId: 'NCT12345678', briefTitle: 'Trial' },
      contactsLocationsModule: { overallOfficials: [
        { name: 'Wei Wang', affiliation: 'Hospital', role: 'INVESTIGATOR' },
        { name: 'Wei Wang', affiliation: 'Hospital', role: 'INVESTIGATOR' },
      ] },
    } }] }))
    const results = await discoverFromSource('clinical_trials', 'trial', new AbortController().signal, fetcher)
    expect(results[0].identityFingerprint).not.toBe(results[1].identityFingerprint)
  })

  it('uses an explicit upstream email as a strong cross-record identity', async () => {
    let request = 0
    const fetcher = vi.fn(async () => json({ studies: [{ protocolSection: {
      identificationModule: { nctId: request++ === 0 ? 'NCT12345678' : 'NCT87654321', briefTitle: 'Trial' },
      contactsLocationsModule: { centralContacts: [
        { name: 'Lin Zhou', affiliation: 'Heart Center', role: 'CONTACT', email: 'LIN.ZHOU@example.test' },
      ] },
    } }] }))
    const first = await discoverFromSource('clinical_trials', 'trial one', new AbortController().signal, fetcher)
    const second = await discoverFromSource('clinical_trials', 'trial two', new AbortController().signal, fetcher)
    expect(first[0].identityFingerprint).toBe(second[0].identityFingerprint)
  })

  it('does not namespace strong email identity by discovery source', async () => {
    const clinicalFetcher = vi.fn(async () => json({ studies: [{ protocolSection: {
      identificationModule: { nctId: 'NCT12345678', briefTitle: 'Trial' },
      contactsLocationsModule: { centralContacts: [
        { name: 'Lin Zhou', affiliation: 'Heart Center', role: 'CONTACT', email: 'lin.zhou@example.test' },
      ] },
    } }] }))
    const result = await discoverFromSource('clinical_trials', 'trial', new AbortController().signal, clinicalFetcher)
    const sourceIndependentFingerprint = createHash('sha256')
      .update('email|lin.zhou@example.test')
      .digest('hex')

    expect(result[0].identityFingerprint).toBe(sourceIndependentFingerprint)
  })
})

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
