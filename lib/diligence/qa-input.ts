export const MAX_QA_RESPONSE_COUNT = 100
export const MAX_QA_IDENTIFIER_LENGTH = 256
export const MAX_QA_ANSWER_LENGTH = 50_000
export const MAX_QA_ANSWER_BYTES = 100_000
export const MAX_QA_ANSWERS_PAYLOAD_BYTES = 1_850_000
export const MAX_QA_RESPONSE_BODY_BYTES = 2_000_000
export const MAX_QA_FINISH_BODY_BYTES = 8_192
export const MAX_QA_ENTRY_BODY_BYTES = 262_144
export const MAX_QA_EVIDENCE_ENTRY_BYTES = 120_000

export class QARequestBodyError extends Error {
  constructor(readonly status: 400 | 413, message: string) {
    super(message)
  }
}

export async function readBoundedJsonRequest(req: Request, maxBytes: number): Promise<unknown> {
  const contentLength = req.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new QARequestBodyError(400, 'Invalid Content-Length')
    }
    const declaredBytes = Number(contentLength)
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes) {
      await req.body?.cancel().catch(() => undefined)
      throw new QARequestBodyError(413, 'Request body too large')
    }
  }

  if (!req.body) throw new QARequestBodyError(400, 'Invalid request body')
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new QARequestBodyError(413, 'Request body too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new QARequestBodyError(400, 'Invalid JSON')
  }
}

export function readBoundedPartnerQAJson(req: Request): Promise<unknown> {
  return readBoundedJsonRequest(req, MAX_QA_RESPONSE_BODY_BYTES)
}

export function readBoundedQAFinishJson(req: Request): Promise<unknown> {
  return readBoundedJsonRequest(req, MAX_QA_FINISH_BODY_BYTES)
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

type ParsedPartnerQAResponse = {
  ok: true
  sessionId: string
  draftId: string
  answers: Array<{ question_id: string; answer_text: string }>
} | {
  ok: false
  status: 400 | 413
  error: string
}

export function parsePartnerQAResponseBody(body: unknown): ParsedPartnerQAResponse {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'Invalid request body' }
  }

  const candidate = body as { session_id?: unknown; draft_id?: unknown; answers?: unknown }
  if (
    typeof candidate.session_id !== 'string'
    || !candidate.session_id.trim()
    || typeof candidate.draft_id !== 'string'
    || !candidate.draft_id.trim()
  ) {
    return { ok: false, status: 400, error: 'session_id and draft_id required' }
  }
  const sessionId = candidate.session_id.trim()
  const draftId = candidate.draft_id.trim()
  if (sessionId.length > MAX_QA_IDENTIFIER_LENGTH || draftId.length > MAX_QA_IDENTIFIER_LENGTH) {
    return { ok: false, status: 413, error: 'Identifier is too long' }
  }
  if (!Array.isArray(candidate.answers) || candidate.answers.length === 0) {
    return { ok: false, status: 400, error: 'No valid answers provided' }
  }
  if (candidate.answers.length > MAX_QA_RESPONSE_COUNT) {
    return { ok: false, status: 413, error: 'Too many answers' }
  }

  const answers: Array<{ question_id: string; answer_text: string }> = []
  for (const item of candidate.answers) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, status: 400, error: 'Invalid answer' }
    }
    const answer = item as { question_id?: unknown; answer_text?: unknown }
    if (typeof answer.question_id !== 'string' || typeof answer.answer_text !== 'string') {
      return { ok: false, status: 400, error: 'Invalid answer' }
    }
    const questionId = answer.question_id.trim()
    const answerText = answer.answer_text.trim()
    if (!questionId || !answerText) {
      return { ok: false, status: 400, error: 'Invalid answer' }
    }
    if (
      questionId.length > MAX_QA_IDENTIFIER_LENGTH
      || answerText.length > MAX_QA_ANSWER_LENGTH
      || utf8ByteLength(answerText) > MAX_QA_ANSWER_BYTES
    ) {
      return { ok: false, status: 413, error: 'Answer is too large' }
    }
    answers.push({ question_id: questionId, answer_text: answerText })
  }

  if (utf8ByteLength(JSON.stringify(answers)) > MAX_QA_ANSWERS_PAYLOAD_BYTES) {
    return { ok: false, status: 413, error: 'Answers payload is too large' }
  }

  return { ok: true, sessionId, draftId, answers }
}

type ParsedQAFinishBody = {
  ok: true
  sessionId: string
  draftId: string
} | {
  ok: false
  status: 400 | 413
  error: string
}

export function parseQAFinishBody(body: unknown): ParsedQAFinishBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'Invalid request body' }
  }
  const candidate = body as { session_id?: unknown; draft_id?: unknown }
  if (typeof candidate.session_id !== 'string' || typeof candidate.draft_id !== 'string') {
    return { ok: false, status: 400, error: 'session_id and draft_id required' }
  }
  const sessionId = candidate.session_id.trim()
  const draftId = candidate.draft_id.trim()
  if (!sessionId || !draftId) {
    return { ok: false, status: 400, error: 'session_id and draft_id required' }
  }
  if (sessionId.length > MAX_QA_IDENTIFIER_LENGTH || draftId.length > MAX_QA_IDENTIFIER_LENGTH) {
    return { ok: false, status: 413, error: 'Identifier is too long' }
  }
  return { ok: true, sessionId, draftId }
}
