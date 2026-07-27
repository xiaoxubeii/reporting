import { describe, expect, it } from 'vitest'
import { themeCssVars } from './theme'

describe('themeCssVars public tenant boundary', () => {
  it('emits only whitelisted validated theme values', () => {
    expect(themeCssVars({ accent: '217 91% 60%', font: 'hanken', radius: 0.75 })).toBe(
      '--primary:217 91% 60%;--primary-foreground:0 0% 9%;--ring:217 91% 60%;--brand:217 91% 60%;--brand-foreground:0 0% 9%;--font-sans:var(--font-hanken);--radius:0.75rem',
    )
  })

  it('drops injected accents and unknown fonts instead of interpolating them into CSS', () => {
    const css = themeCssVars({
      accent: '0 0% 0%;}body{background:url(https://attacker.invalid)',
      font: 'url(https://attacker.invalid)',
      radius: -1,
    })

    expect(css).toBe('')
    expect(css).not.toContain('attacker.invalid')
  })
})
