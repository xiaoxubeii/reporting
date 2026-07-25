import { createServer } from 'node:net'

export const BLOCK_SIZE = 10
export const DEFAULT_BASE_PORT = 5000
export const MIN_BASE_PORT = 1024
export const MAX_BASE_PORT = 65_535 - (BLOCK_SIZE - 1)

export function validateBasePort(rawValue) {
  const text = String(rawValue ?? DEFAULT_BASE_PORT)
  if (!/^\d+$/.test(text)) {
    throw new Error(`DEVCTL_BASE_PORT must be an integer between ${MIN_BASE_PORT} and ${MAX_BASE_PORT}`)
  }
  const value = Number(text)
  if (!Number.isSafeInteger(value) || value < MIN_BASE_PORT || value > MAX_BASE_PORT) {
    throw new Error(`DEVCTL_BASE_PORT must be an integer between ${MIN_BASE_PORT} and ${MAX_BASE_PORT}`)
  }
  return value
}

export function portMapForBase(basePort) {
  const validated = validateBasePort(basePort)
  return Object.freeze({
    web: validated,
    cron: validated + 1,
  })
}

export async function findAvailablePortBlock(options = {}) {
  const startPort = validateBasePort(options.startPort ?? DEFAULT_BASE_PORT)
  const host = options.host ?? '127.0.0.1'
  const isAvailable = options.isAvailable ?? (port => canBindPort(port, host))

  for (let basePort = startPort; basePort <= MAX_BASE_PORT; basePort += BLOCK_SIZE) {
    const results = await Promise.all(
      Array.from({ length: BLOCK_SIZE }, (_, offset) => isAvailable(basePort + offset)),
    )
    if (results.every(Boolean)) return basePort
  }
  throw new Error(`No complete ten-port block is available from ${startPort} through 65535`)
}

export async function canBindPort(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ port, host, exclusive: true }, () => {
      server.close(error => resolve(!error))
    })
  })
}
