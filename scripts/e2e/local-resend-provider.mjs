import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

const MAX_BODY_BYTES = 2 * 1024 * 1024

export async function startLocalResendProvider() {
  const apiKey = `re_e2e_${randomBytes(24).toString('base64url')}`
  const controlToken = randomBytes(32).toString('base64url')
  const outbound = new Map()
  const inbound = new Map()

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, { status: 'ok' })
      }
      if (url.pathname.startsWith('/__e2e/')) {
        if (!authorized(request, controlToken)) return sendJson(response, 401, { error: 'Unauthorized' })
        return await handleControlRequest(request, response, url, outbound, inbound)
      }
      if (!authorized(request, apiKey)) return sendJson(response, 401, { message: 'Unauthorized' })
      if (request.method === 'POST' && url.pathname === '/emails') {
        const payload = await readJson(request)
        if (!validOutbound(payload)) return sendJson(response, 400, { message: 'Invalid email' })
        const id = `email_e2e_${randomUUID()}`
        outbound.set(id, Object.freeze({
          id,
          idempotencyKey: header(request, 'idempotency-key'),
          payload: structuredClone(payload),
        }))
        return sendJson(response, 200, { id })
      }
      const receiving = url.pathname.match(/^\/emails\/receiving\/([A-Za-z0-9_-]{1,240})$/)
      if (request.method === 'GET' && receiving) {
        const email = inbound.get(receiving[1])
        return email
          ? sendJson(response, 200, email)
          : sendJson(response, 404, { message: 'Email not found' })
      }
      return sendJson(response, 404, { message: 'Not found' })
    } catch (error) {
      return sendJson(response, error instanceof BodyError ? error.status : 400, {
        message: error instanceof Error ? error.message : 'Invalid request',
      })
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local Resend provider did not bind a TCP port')
  const baseUrl = `http://127.0.0.1:${address.port}`
  return Object.freeze({
    apiKey,
    baseUrl,
    controlUrl: `${baseUrl}/__e2e`,
    controlToken,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  })
}

async function handleControlRequest(request, response, url, outbound, inbound) {
  const outboundMatch = url.pathname.match(/^\/__e2e\/outbound\/([A-Za-z0-9_-]{1,240})$/)
  if (request.method === 'GET' && outboundMatch) {
    const email = outbound.get(outboundMatch[1])
    return email
      ? sendJson(response, 200, email)
      : sendJson(response, 404, { error: 'Not found' })
  }
  if (request.method === 'POST' && url.pathname === '/__e2e/inbound') {
    const email = await readJson(request)
    if (!validInbound(email)) return sendJson(response, 400, { error: 'Invalid inbound email' })
    inbound.set(email.id, Object.freeze(structuredClone(email)))
    return sendJson(response, 201, { id: email.id })
  }
  return sendJson(response, 404, { error: 'Not found' })
}

function validOutbound(value) {
  return record(value)
    && safeString(value.from, 1024)
    && (safeString(value.to, 1024) || safeStringArray(value.to, 50, 320))
    && safeString(value.subject, 998)
    && (!('reply_to' in value) || value.reply_to === undefined || safeString(value.reply_to, 1024))
}

function validInbound(value) {
  return record(value)
    && safeToken(value.id, 240)
    && validTimestamp(value.created_at)
    && safeString(value.from, 320)
    && safeStringArray(value.to, 50, 320)
    && safeStringArray(value.cc, 50, 320)
    && safeStringArray(value.bcc, 50, 320)
    && safeStringArray(value.reply_to, 50, 320)
    && safeMessageId(value.message_id)
    && safeString(value.subject, 998)
    && (value.text === null || safeBody(value.text, 1024 * 1024))
    && (value.html === null || safeBody(value.html, 2 * 1024 * 1024))
    && record(value.headers)
    && Array.isArray(value.attachments)
    && value.attachments.length === 0
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeString(value, maximum) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\r\n\0]/.test(value)
}

function safeBody(value, maximum) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= maximum && !value.includes('\0')
}

function safeStringArray(value, count, maximum) {
  return Array.isArray(value) && value.length <= count && value.every(item => safeString(item, maximum))
}

function safeToken(value, maximum) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && /^[A-Za-z0-9_-]+$/.test(value)
}

function safeMessageId(value) {
  return typeof value === 'string' && value.length <= 998 && /^<[^<>\s]+>$/.test(value)
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function authorized(request, expected) {
  const actual = header(request, 'authorization')
  if (!actual?.startsWith('Bearer ')) return false
  const token = actual.slice('Bearer '.length)
  const left = Buffer.from(token)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function header(request, name) {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value ?? null
}

async function readJson(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new BodyError(413, 'Payload too large')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8'))
  } catch {
    throw new BodyError(400, 'Invalid JSON')
  }
}

class BodyError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(`${JSON.stringify(body)}\n`)
}
