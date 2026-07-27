import { describe, expect, it } from 'vitest'
import { workspaceAuthUrlForInput } from './workspace-entry'

describe('workspaceAuthUrlForInput', () => {
  it.each([
    ['northstar', 'https://northstar.fundworkspace.example/auth'],
    ['northstar.fundworkspace.example', 'https://northstar.fundworkspace.example/auth'],
    ['https://northstar.fundworkspace.example/', 'https://northstar.fundworkspace.example/auth'],
    ['https://northstar.fundworkspace.example/auth', 'https://northstar.fundworkspace.example/auth'],
    [' HTTPS://NORTHSTAR.FUNDWORKSPACE.EXAMPLE/AUTH ', 'https://northstar.fundworkspace.example/auth'],
  ])('canonicalizes %s', (input, expected) => {
    expect(workspaceAuthUrlForInput('https://fundworkspace.example', input)).toBe(expected)
  })

  it('preserves localhost protocol and port', () => {
    expect(workspaceAuthUrlForInput('http://localhost:65267', 'northstar')).toBe(
      'http://northstar.localhost:65267/auth',
    )
    expect(workspaceAuthUrlForInput('http://localhost:65267', 'northstar.localhost:65267/auth')).toBe(
      'http://northstar.localhost:65267/auth',
    )
  })

  it.each([
    '',
    'www',
    'api',
    'ab',
    'xn--example',
    'two.words',
    'https://foreign.example/auth',
    'https://user:pass@northstar.fundworkspace.example/auth',
    'https://northstar.fundworkspace.example/dashboard',
    'https://northstar.fundworkspace.example/auth?next=/dashboard',
    'https://northstar.fundworkspace.example/auth#token',
    'https://a.b.fundworkspace.example/auth',
    'https://northstar.fundworkspace.example:8443/auth',
  ])('rejects without enumerating: %s', input => {
    expect(workspaceAuthUrlForInput('https://fundworkspace.example', input)).toBeNull()
  })

  it('rejects an untrusted platform origin instead of guessing', () => {
    expect(workspaceAuthUrlForInput('not a platform origin', 'northstar')).toBeNull()
    expect(workspaceAuthUrlForInput('https://fundworkspace.example/pricing', 'northstar')).toBeNull()
  })
})
