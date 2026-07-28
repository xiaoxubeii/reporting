import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROOT_LAYOUT = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')

describe('root layout hydration boundary', () => {
  it('preserves the next-themes html hydration boundary alongside timezone propagation', () => {
    expect(ROOT_LAYOUT).toContain('<html lang={resolvedLocale} suppressHydrationWarning')
    expect(ROOT_LAYOUT).toContain('timeZone={timeZone}')
    expect(ROOT_LAYOUT).toContain('timeZoneSource={timeZoneSource}')
  })
})
