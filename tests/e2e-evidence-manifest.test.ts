import { afterEach, describe, expect, it } from 'vitest'
import { readFile, rm, stat } from 'node:fs/promises'
import {
  buildE2ERunManifest,
  classifyE2ERun,
  summarizePlaywrightReport,
  writeE2ERunManifest,
} from '@/scripts/e2e/evidence-manifest.mjs'

const target = `/tmp/reporting-e2e-manifest-${process.pid}.json`

afterEach(async () => { await rm(target, { force: true }) })

describe('comprehensive E2E evidence manifest', () => {
  it('classifies preflight, test, cleanup, and successful outcomes', () => {
    expect(classifyE2ERun({ exitCode: 0, phase: 'playwright' })).toBe('passed')
    expect(classifyE2ERun({ exitCode: 1, phase: 'capabilities' })).toBe('preflight_failure')
    expect(classifyE2ERun({ exitCode: 1, phase: 'playwright' })).toBe('test_failure')
    expect(classifyE2ERun({ exitCode: 1, phase: 'cleanup', cleanupFailed: true })).toBe('cleanup_failure')
  })

  it('writes an atomic owner-only manifest with bounded failure details and artifact paths', async () => {
    const manifest = buildE2ERunManifest({
      runId: 'run-1',
      startedAt: '2026-07-28T00:00:00.000Z',
      completedAt: '2026-07-28T00:01:00.000Z',
      exitCode: 1,
      phase: 'playwright',
      failureMessage: 'x'.repeat(600),
      artifacts: { capabilityReport: 'capabilities.json', fixtureLifecycle: 'fixture-lifecycle.json' },
    })
    await writeE2ERunManifest(manifest, target)

    const parsed = JSON.parse(await readFile(target, 'utf8'))
    expect(parsed.classification).toBe('test_failure')
    expect(parsed.failure.message).toHaveLength(500)
    expect(parsed.artifacts.fixtureLifecycle).toBe('fixture-lifecycle.json')
    expect((await stat(target)).mode & 0o777).toBe(0o600)
  })

  it('summarizes final scenario outcomes without copying result payloads', () => {
    const summary = summarizePlaywrightReport({
      stats: { duration: 1234 },
      suites: [{ specs: [
        { title: 'passes', tests: [{ results: [{ status: 'passed' }] }] },
        { title: 'fails', tests: [{ results: [{ status: 'failed' }] }] },
      ] }],
    })
    expect(summary).toEqual({
      passed: 1,
      failed: 1,
      timedOut: 0,
      skipped: 0,
      interrupted: 0,
      failures: ['fails'],
      durationMs: 1234,
    })
  })
})
