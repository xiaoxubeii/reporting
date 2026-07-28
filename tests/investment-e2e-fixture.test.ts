import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('investment E2E fixture CLI', () => {
  it('loads the current Next environment module before validating the command', () => {
    const result = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['--yes', 'tsx', resolve(process.cwd(), 'scripts/investment-e2e-fixture.ts'), 'invalid'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8000',
          SUPABASE_SERVICE_ROLE_KEY: 'fixture-test-service-role',
          E2E_RUN_ID: '11111111-1111-4111-8111-111111111111',
        },
      }
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage: investment-e2e-fixture.ts')
    expect(result.stderr).not.toContain('Cannot destructure property')
  })
})
