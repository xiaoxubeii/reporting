import { createServer, type Server } from 'node:net'
import { once } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'

import {
  findAvailablePortBlock,
  portMapForBase,
  validateBasePort,
} from '../scripts/devctl/ports.mjs'

const servers = new Set<Server>()

afterEach(async () => {
  await Promise.all(Array.from(servers, closeServer))
  servers.clear()
})

describe('devctl port block allocation', () => {
  it('maps the four managed services inside one ten-port block', () => {
    expect(portMapForBase(5000)).toEqual({
      web: 5000,
      cron: 5001,
      miniflux: 5002,
      searxng: 5003,
    })
  })

  it('selects 5000 when the complete default block is free', async () => {
    await expect(findAvailablePortBlock({
      startPort: 5000,
      isAvailable: async () => true,
    })).resolves.toBe(5000)
  })

  it('advances the whole block by ten when any reserved port is occupied', async () => {
    await listenOn(5007)

    await expect(findAvailablePortBlock({ startPort: 5000 })).resolves.toBe(5010)
  })

  it('continues through multiple occupied blocks', async () => {
    await listenOn(5000)
    await listenOn(5019)

    await expect(findAvailablePortBlock({ startPort: 5000 })).resolves.toBe(5020)
  })

  it('fails before overflow when no complete block can fit', async () => {
    await expect(findAvailablePortBlock({
      startPort: 65520,
      isAvailable: async () => false,
    })).rejects.toThrow(
      'No complete ten-port block is available',
    )
  })

  it('rejects malformed or privileged base ports', () => {
    expect(() => validateBasePort('5000')).not.toThrow()
    expect(() => validateBasePort('5000x')).toThrow('DEVCTL_BASE_PORT')
    expect(() => validateBasePort('80')).toThrow('DEVCTL_BASE_PORT')
  })
})

async function listenOn(port: number) {
  const server = createServer()
  servers.add(server)
  server.listen(port, '127.0.0.1')
  await once(server, 'listening')
}

async function closeServer(server: Server) {
  if (!server.listening) return
  server.close()
  await once(server, 'close')
}
