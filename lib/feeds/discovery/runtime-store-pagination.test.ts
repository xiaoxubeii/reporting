import { describe, expect, it, vi } from 'vitest'

import { collectMaterializationRows } from './runtime-store'

describe('collectMaterializationRows', () => {
  it('loads every row when a version backfill exceeds the historical 5,000-row limit', async () => {
    const source = Array.from({ length: 5_501 }, (_, id) => ({ id }))
    const fetchPage = vi.fn(async (from: number, to: number) => source.slice(from, to + 1))

    const result = await collectMaterializationRows(fetchPage)

    expect(result.complete).toBe(true)
    expect(result.rows).toHaveLength(5_501)
    expect(fetchPage).toHaveBeenCalledTimes(6)
  })

  it('fails closed instead of publishing a truncated materialization set', async () => {
    const fetchPage = vi.fn(async (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, offset) => ({ id: from + offset })),
    )

    const result = await collectMaterializationRows(fetchPage, { pageSize: 1_000, maxRows: 5_000 })

    expect(result.complete).toBe(false)
    expect(result.rows).toHaveLength(5_000)
  })
})
