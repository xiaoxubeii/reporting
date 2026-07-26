import { describe, expect, it } from 'vitest'
import { mergeDiscoveredPeople, selectDiscoveredPeople } from './service'
import type { DiscoveredExpert, ExpertDiscoverySourceId } from './types'

describe('mergeDiscoveredPeople', () => {
  it('aggregates distinct evidence and preserves an explicit source email', () => {
    const first = person('fingerprint', 'PMID-1', null)
    const second = person('fingerprint', 'PMID-2', 'expert@example.test')

    const result = mergeDiscoveredPeople([first, second])

    expect(result).toHaveLength(1)
    expect(result[0].email).toBe('expert@example.test')
    expect(result[0].evidence.map(item => item.recordId)).toEqual(['PMID-1', 'PMID-2'])
  })

  it('deduplicates repeated evidence records', () => {
    const duplicate = person('fingerprint', 'PMID-1', null)
    expect(mergeDiscoveredPeople([duplicate, duplicate])[0].evidence).toHaveLength(1)
  })

  it('selects fairly from saturated discovery sources before applying the global limit', () => {
    const pubmed = Array.from({ length: 40 }, (_, index) =>
      person(`pubmed-${index}`, `PMID-${index}`, null, 'pubmed'),
    )
    const trials = Array.from({ length: 40 }, (_, index) =>
      person(`trial-${index}`, `NCT-${index}`, null, 'clinical_trials'),
    )

    const result = selectDiscoveredPeople([{ people: pubmed }, { people: trials }], 25)

    expect(result).toHaveLength(25)
    expect(result[0].evidence[0].sourceId).toBe('pubmed')
    expect(result[1].evidence[0].sourceId).toBe('clinical_trials')
    expect(result.filter(item => item.evidence[0].sourceId === 'pubmed')).toHaveLength(13)
    expect(result.filter(item => item.evidence[0].sourceId === 'clinical_trials')).toHaveLength(12)
  })
})

function person(
  identityFingerprint: string,
  recordId: string,
  email: string | null,
  sourceId: ExpertDiscoverySourceId = 'pubmed',
): DiscoveredExpert {
  return Object.freeze({
    identityFingerprint,
    name: 'Ada Zhang',
    email,
    title: 'Investigator',
    organization: 'Heart Center',
    profileText: 'Clinical investigator',
    evidence: Object.freeze([Object.freeze({
      sourceId,
      recordId,
      recordTitle: recordId,
      url: `https://pubmed.ncbi.nlm.nih.gov/${recordId}/`,
      role: 'Author',
    })]),
  })
}
