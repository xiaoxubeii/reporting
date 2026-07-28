import { describe, expect, it } from 'vitest'
import {
  mergeFounderDossiers,
  parseFounderDossiers,
  type FounderDossier,
} from './research-founder-dossiers'

const existing: FounderDossier = {
  founder_name: 'Dr. Ada Chen',
  role: 'CEO',
  background_summary: 'Partner-edited background.',
  sources: [{ title: 'Existing profile', url: 'https://example.com/ada' }],
  open_questions: ['Confirm prior exit.'],
}

describe('mergeFounderDossiers', () => {
  it('preserves existing values and order while merging unique generated sources', () => {
    const result = mergeFounderDossiers([existing], [{
      founder_name: '  DR. ADA CHEN ',
      role: 'Co-founder',
      background_summary: 'Generated replacement that must not win.',
      sources: [
        { title: 'Existing profile duplicate', url: 'https://example.com/ada' },
        { title: 'New interview', url: 'https://example.com/interview' },
      ],
      open_questions: ['Generated question.'],
    }])

    expect(result).toEqual([{
      ...existing,
      sources: [
        existing.sources[0],
        { title: 'New interview', url: 'https://example.com/interview' },
      ],
    }])
  })

  it('retains unmatched existing dossiers and appends newly discovered founders', () => {
    const discovered: FounderDossier = {
      founder_name: 'Sam Rivera',
      role: 'CTO',
      background_summary: 'Newly discovered technical founder.',
      sources: [],
      open_questions: [],
    }

    expect(mergeFounderDossiers([existing], [discovered])).toEqual([existing, discovered])
  })

  it('deduplicates generated founders deterministically and does not mutate inputs', () => {
    const first: FounderDossier = {
      founder_name: 'Sam Rivera', role: 'CTO', background_summary: 'First', sources: [], open_questions: [],
    }
    const duplicate: FounderDossier = {
      founder_name: ' sam   rivera ', role: 'Founder', background_summary: 'Second', sources: [], open_questions: [],
    }
    const generated = [first, duplicate]

    const result = mergeFounderDossiers([], generated)

    expect(result).toEqual([first])
    expect(generated).toEqual([first, duplicate])
    expect(result).not.toBe(generated)
  })

  it('normalizes model output and discards malformed dossiers without throwing', () => {
    const parsed = parseFounderDossiers([
      null,
      { founder_name: 42 },
      {
        founder_name: ' Ada Chen ',
        role: null,
        background_summary: ' Research profile ',
        sources: [
          null,
          { title: ' Profile ', url: ' https://example.com/ada ' },
          { title: 12, url: 'https://example.com/invalid' },
        ],
        open_questions: [' Confirm role ', 5, ''],
      },
    ])

    expect(parsed).toEqual({
      dossiers: [{
        founder_name: 'Ada Chen',
        role: '',
        background_summary: 'Research profile',
        sources: [{ title: 'Profile', url: 'https://example.com/ada' }],
        open_questions: ['Confirm role'],
      }],
      discarded: 2,
    })
  })
})
