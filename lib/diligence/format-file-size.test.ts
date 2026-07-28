import { describe, expect, it } from 'vitest'

import { formatFileSize } from './format-file-size'

const formatNumber = (value: number, options?: { maximumFractionDigits?: number }) =>
  new Intl.NumberFormat('en-US', options).format(value)

describe('formatFileSize', () => {
  it('uses bytes for a file smaller than one kilobyte', () => {
    expect(formatFileSize(512, formatNumber)).toBe('512 B')
  })

  it('distinguishes an empty file from an unavailable size', () => {
    expect(formatFileSize(0, formatNumber)).toBe('0 B')
  })

  it('uses kilobytes for a non-empty file smaller than one megabyte', () => {
    expect(formatFileSize(18_687, formatNumber)).toBe('18 KB')
  })

  it('uses megabytes for a file of at least one megabyte', () => {
    expect(formatFileSize(1.5 * 1024 * 1024, formatNumber)).toBe('1.5 MB')
  })

  it('uses a placeholder when the size is unavailable', () => {
    expect(formatFileSize(null, formatNumber)).toBe('—')
  })
})
