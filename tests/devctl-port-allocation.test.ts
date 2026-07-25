import { describe, expect, it } from 'vitest'

import {
  findAvailablePortBlock,
  portMapForBase,
  validateBasePort,
} from '../scripts/devctl/ports.mjs'

describe('devctl port block allocation', () => {
  it('maps only the two lifecycle-managed services inside one ten-port block', () => {
    expect(portMapForBase(5000)).toEqual({
      web: 5000,
      cron: 5001,
    })
  })

  it('selects 5000 when the complete default block is free', async () => {
    await expect(findAvailablePortBlock({
      startPort: 5000,
      isAvailable: async () => true,
    })).resolves.toBe(5000)
  })

  it('advances the whole block by ten when any reserved port is occupied', async () => {
    await expect(findAvailablePortBlock({
      startPort: 5000,
      isAvailable: async (port: number) => port !== 5007,
    })).resolves.toBe(5010)
  })

  it('continues through multiple occupied blocks', async () => {
    const occupied = new Set([5000, 5019])

    await expect(findAvailablePortBlock({
      startPort: 5000,
      isAvailable: async (port: number) => !occupied.has(port),
    })).resolves.toBe(5020)
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
