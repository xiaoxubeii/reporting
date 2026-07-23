import { describe, expect, it } from 'vitest'
import { formatPeriodLabel } from './format-period-label'

describe('formatPeriodLabel', () => {
  it('formats legacy monthly labels for the active locale', () => {
    const period = {
      period_label: 'Mar 2024',
      period_year: 2024,
      period_quarter: 1,
      period_month: 3,
    }

    expect(formatPeriodLabel(period, 'en')).toBe('Mar 2024')
    expect(formatPeriodLabel(period, 'zh-CN')).toBe('2024年3月')
  })

  it('falls back to structured monthly fields when the label has no known format', () => {
    const period = {
      period_label: '',
      period_year: 2024,
      period_quarter: 1,
      period_month: 3,
    }

    expect(formatPeriodLabel(period, 'en')).toBe('Mar 2024')
    expect(formatPeriodLabel(period, 'zh-CN')).toBe('2024年3月')
  })

  it('localizes canonical and legacy persisted labels', () => {
    expect(formatPeriodLabel({ period_label: '2024-03' }, 'zh-CN')).toBe('2024年3月')
    expect(formatPeriodLabel({ period_label: 'March 2024' }, 'zh-CN')).toBe('2024年3月')
    expect(formatPeriodLabel({ period_label: 'Q3 2024' }, 'zh-CN')).toBe('2024年第3季度')
    expect(formatPeriodLabel({ period_label: 'FY 2024' }, 'zh-CN')).toBe('2024财年')
    expect(formatPeriodLabel({ period_label: 'Year End 2024' }, 'zh-CN')).toBe('2024年末')
  })

  it('preserves year-end semantics when structured month fields are also present', () => {
    expect(formatPeriodLabel({
      period_label: 'Year End 2025',
      period_year: 2025,
      period_quarter: 4,
      period_month: 12,
    }, 'zh-CN')).toBe('2025年末')
  })

  it('preserves unknown source labels', () => {
    expect(formatPeriodLabel({ period_label: 'Since inception' }, 'zh-CN')).toBe('Since inception')
  })
})
