import { NextRequest, NextResponse } from 'next/server'
import { IdentityOnboardingError } from './errors'

export async function readIdentityJson(
  request: NextRequest,
  maxBytes = 8 * 1024,
): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') {
    throw new IdentityOnboardingError('invalid_request', 'Content-Type must be application/json.', 400)
  }
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > maxBytes) {
    if (request.body) await request.body.cancel().catch(() => undefined)
    throw new IdentityOnboardingError('invalid_request', 'Request body is too large.', 413)
  }
  if (!request.body) {
    throw new IdentityOnboardingError('invalid_request', 'Request body must be valid JSON.', 400)
  }
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new IdentityOnboardingError('invalid_request', 'Request body is too large.', 413)
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    try {
      return JSON.parse(text)
    } catch {
      throw new IdentityOnboardingError('invalid_request', 'Request body must be valid JSON.', 400)
    }
  } finally {
    reader.releaseLock()
  }
}

export function identityErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof IdentityOnboardingError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    )
  }
  console.error(`[${context}] identity operation failed`)
  return NextResponse.json(
    { error: 'Identity service is temporarily unavailable.', code: 'storage_unavailable' },
    { status: 503 },
  )
}
