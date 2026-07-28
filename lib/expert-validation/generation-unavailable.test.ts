import { describe, expect, it } from 'vitest'

import { isExpertGenerationUnavailable } from './generation-unavailable'

describe('expert validation generation availability', () => {
  it.each([
    'Claude API key not configured for fund 123',
    'OpenAI API key not configured for fund 123',
    'Gemini API key not configured for fund 123',
    'Custom OpenAI-compatible API key not configured for fund 123',
    'ENCRYPTION_KEY environment variable is not set',
  ])('classifies missing provider configuration as designed unavailable: %s', message => {
    expect(isExpertGenerationUnavailable(new Error(message))).toBe(true)
  })

  it.each([
    'Provider returned malformed JSON',
    'Database connection failed',
    'Request timed out',
  ])('does not hide unexpected generation defects: %s', message => {
    expect(isExpertGenerationUnavailable(new Error(message))).toBe(false)
  })
})
