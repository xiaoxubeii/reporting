import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function classifyE2ERun({ exitCode, phase, cleanupFailed = false }) {
  if (cleanupFailed) return 'cleanup_failure'
  if (exitCode === 0) return 'passed'
  if (phase === 'playwright') return 'test_failure'
  if (['bootstrap', 'services', 'migrations', 'capabilities', 'fixtures'].includes(phase)) {
    return 'preflight_failure'
  }
  return 'runner_failure'
}

export function buildE2ERunManifest({
  runId,
  startedAt,
  completedAt,
  exitCode,
  phase,
  cleanupFailed = false,
  failureMessage = '',
  artifacts,
  capabilities = null,
  fixtureLifecycle = null,
  scenarios = null,
}) {
  return {
    schemaVersion: 1,
    runId,
    startedAt,
    completedAt,
    exitCode,
    classification: classifyE2ERun({ exitCode, phase, cleanupFailed }),
    failure: failureMessage ? { phase, message: String(failureMessage).slice(0, 500) } : null,
    artifacts: { ...artifacts },
    capabilities,
    fixtureLifecycle,
    scenarios,
  }
}

export function summarizePlaywrightReport(report) {
  const statuses = { passed: 0, failed: 0, timedOut: 0, skipped: 0, interrupted: 0 }
  const failures = []
  const visitSuite = suite => {
    for (const spec of suite?.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? []
        const finalStatus = results.at(-1)?.status ?? test.status ?? 'skipped'
        if (finalStatus in statuses) statuses[finalStatus] += 1
        else statuses.failed += 1
        if (!['passed', 'skipped'].includes(finalStatus)) failures.push(String(spec.title ?? 'Unnamed scenario').slice(0, 300))
      }
    }
    for (const child of suite?.suites ?? []) visitSuite(child)
  }
  for (const suite of report?.suites ?? []) visitSuite(suite)
  return {
    ...statuses,
    failures: [...new Set(failures)],
    durationMs: Number(report?.stats?.duration ?? 0),
  }
}

export async function writeE2ERunManifest(manifest, target) {
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, target)
}
