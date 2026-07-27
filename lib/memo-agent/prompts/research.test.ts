import { describe, expect, it } from 'vitest'

import type { IngestionOutput } from '@/lib/memo-agent/stages/ingest'
import { buildResearchCompetitorsContent } from './research'

const INGESTION_WITHOUT_COMPETITORS: IngestionOutput = {
  documents: [{
    document_id: 'memo-1',
    detected_type: 'pitch_deck',
    type_confidence: 'high',
    summary: 'A cardiovascular diagnostic product for outpatient clinics.',
    issues: [],
    claims: [],
  }, {
    document_id: 'expert-1',
    detected_type: 'industry_expert',
    type_confidence: 'high',
    summary: 'An expert mapped the external competitive landscape.',
    issues: [],
    claims: [{
      id: 'expert-claim-1',
      field: 'competitive_landscape',
      value: 'AliveCor and iRhythm are direct or adjacent competitors.',
      context: 'The company did not name these competitors.',
      verification_status: 'unverified',
      criticality: 'high',
      checklist_item_id: null,
    }],
  }],
  gap_analysis: { missing: [], inadequate: [] },
  cross_doc_flags: [],
}

describe('buildResearchCompetitorsContent', () => {
  it('makes an empty company-named bucket explicit when ingestion names no competitors', () => {
    const [block] = buildResearchCompetitorsContent({
      dealName: 'CardioSignal',
      ingestion: INGESTION_WITHOUT_COMPETITORS,
      webSearchEnabled: true,
    })
    const text = block.type === 'text' ? block.text : ''

    expect(text).toContain('No explicit competitor mentions in ingestion')
    expect(text).toContain('return named_by_company as an empty array')
    expect(text).toContain('Do not invent company-named competitors')
    expect(text).toContain('Expert-evidence competitor context (not company-named)')
    expect(text).toContain('AliveCor and iRhythm')
  })
})
