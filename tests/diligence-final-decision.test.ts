import { describe, expect, it } from 'vitest'
import { isFinalDecisionStatus } from '@/lib/diligence/final-decision'

describe('final investment decision status', () => {
  it.each(['invested', 'passed', 'won', 'lost'])('treats %s as final', status => {
    expect(isFinalDecisionStatus(status)).toBe(true)
  })

  it.each(['active', 'on_hold', 'not_started', ''])('does not gate non-final status %s', status => {
    expect(isFinalDecisionStatus(status)).toBe(false)
  })
})
