import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const readBlock = (source: string, marker: string) => {
  const markerStart = source.indexOf(marker)
  const blockStart = source.indexOf('{', markerStart)
  let depth = 0

  expect(markerStart, `missing ${marker}`).toBeGreaterThanOrEqual(0)
  expect(blockStart, `missing ${marker} block`).toBeGreaterThan(markerStart)

  for (let index = blockStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(blockStart + 1, index)
  }

  throw new Error(`unterminated ${marker} block`)
}

const readRule = (source: string, selector: string, offset = 0) => {
  const selectorStart = source.indexOf(selector, offset)
  const ruleStart = source.indexOf('{', selectorStart)
  const ruleEnd = source.indexOf('}', ruleStart)

  expect(selectorStart, `missing ${selector}`).toBeGreaterThanOrEqual(0)
  expect(ruleStart, `missing ${selector} rule`).toBeGreaterThan(selectorStart)
  expect(ruleEnd, `unterminated ${selector} rule`).toBeGreaterThan(ruleStart)

  return source.slice(ruleStart + 1, ruleEnd)
}

const readPngMetadata = (path: string) => {
  const png = readFileSync(resolve(process.cwd(), path))
  return {
    signature: png.subarray(0, 8).toString('hex'),
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png.readUInt8(25),
  }
}

describe('platform landing logo assets', () => {
  it('uses tight 1x and 2x icon variants without scaling a low-resolution raster', () => {
    const component = readSource('components/platform-landing/harmonic-navigation-hero.tsx')
    const navigationStyles = readSource('components/platform-landing/harmonic-navigation-hero.module.css')
    const footerStyles = readSource('components/platform-landing/harmonic-capabilities.module.css')
    const mobileStyles = readBlock(navigationStyles, '@media (max-width: 480px)')

    const displayContexts = [
      { context: 'mobile', rules: [readRule(mobileStyles, '.logoMark')], size: 26, retinaSize: 52 },
      { context: 'desktop', rules: [readRule(navigationStyles, '.logoMark')], size: 32, retinaSize: 64 },
    ] as const

    for (const { context, rules, size, retinaSize } of displayContexts) {
      const pairPattern = new RegExp(
        `image-set\\([\\s\\S]*?fundworkspace-icon-${size}\\.png'\\) 1x,[\\s\\S]*?fundworkspace-icon-${retinaSize}\\.png'\\) 2x[\\s\\S]*?\\)`,
      )
      expect(rules.some(rule => pairPattern.test(rule)), `${context} logo pair`).toBe(true)
    }

    for (const size of [26, 32, 52, 64]) {
      const metadata = readPngMetadata(`public/landing/fundworkspace-icon-${size}.png`)
      expect(metadata).toEqual({
        signature: '89504e470d0a1a0a',
        width: size,
        height: size,
        colorType: 6,
      })
    }

    expect(component).not.toContain('fundworkspace-logo-transparent.png')
    expect(navigationStyles).not.toContain('fundworkspace-logo-transparent.png')
    expect(footerStyles).not.toContain('fundworkspace-logo-transparent.png')
    expect(navigationStyles).not.toContain('transform: scale(1.7)')
    expect(footerStyles).not.toContain('transform: scale(1.7)')
  })
})
