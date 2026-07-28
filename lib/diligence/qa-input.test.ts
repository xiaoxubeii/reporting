import { describe, expect, it } from 'vitest'
import {
  MAX_QA_ANSWERS_PAYLOAD_BYTES,
  MAX_QA_RESPONSE_BODY_BYTES,
  parsePartnerQAResponseBody,
  readBoundedPartnerQAJson,
} from './qa-input'

describe('parsePartnerQAResponseBody', () => {
  it('normalizes a bounded answer batch', () => {
    expect(parsePartnerQAResponseBody({
      session_id: 'session-1',
      draft_id: 'draft-1',
      answers: [{ question_id: 'q1', answer_text: '  Answer  ' }],
    })).toEqual({
      ok: true,
      sessionId: 'session-1',
      draftId: 'draft-1',
      answers: [{ question_id: 'q1', answer_text: 'Answer' }],
    })
  })

  it('requires the exact draft binding', () => {
    expect(parsePartnerQAResponseBody({
      session_id: 'session-1',
      answers: [{ question_id: 'q1', answer_text: 'Answer' }],
    })).toMatchObject({ ok: false, status: 400 })
  })

  it('rejects excessive batches, identifiers, and answer bodies', () => {
    expect(parsePartnerQAResponseBody({
      session_id: 's',
      draft_id: 'd',
      answers: Array.from({ length: 101 }, (_, i) => ({ question_id: `q${i}`, answer_text: 'a' })),
    })).toMatchObject({ ok: false, status: 413 })

    expect(parsePartnerQAResponseBody({
      session_id: 's'.repeat(300),
      draft_id: 'd',
      answers: [{ question_id: 'q', answer_text: 'a' }],
    })).toMatchObject({ ok: false, status: 413 })

    expect(parsePartnerQAResponseBody({
      session_id: 's',
      draft_id: 'd',
      answers: [{ question_id: 'q'.repeat(300), answer_text: 'a' }],
    })).toMatchObject({ ok: false, status: 413 })

    expect(parsePartnerQAResponseBody({
      session_id: 's',
      draft_id: 'd',
      answers: [{ question_id: 'q', answer_text: 'a'.repeat(50_001) }],
    })).toMatchObject({ ok: false, status: 413 })

    expect(parsePartnerQAResponseBody({
      session_id: 's',
      draft_id: 'd',
      answers: [{ question_id: 'q', answer_text: '中'.repeat(40_000) }],
    })).toMatchObject({ ok: false, status: 413 })

    const aggregate = Array.from({ length: 38 }, (_, index) => ({
      question_id: `q-${index}`,
      answer_text: 'a'.repeat(50_000),
    }))
    expect(JSON.stringify(aggregate).length).toBeGreaterThan(MAX_QA_ANSWERS_PAYLOAD_BYTES)
    expect(parsePartnerQAResponseBody({ session_id: 's', draft_id: 'd', answers: aggregate }))
      .toMatchObject({ ok: false, status: 413 })
  })

  it('rejects an oversized body before parsing it', async () => {
    const request = new Request('http://localhost/respond', {
      method: 'POST',
      headers: { 'content-length': String(MAX_QA_RESPONSE_BODY_BYTES + 1) },
      body: '{}',
    })
    await expect(readBoundedPartnerQAJson(request)).rejects.toMatchObject({ status: 413 })
  })
})
