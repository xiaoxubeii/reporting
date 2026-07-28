#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { readExistingSecret, readState } from '../devctl/runtime.mjs'
import {
  assertRequiredE2ECapabilities,
  collectE2ECapabilities,
  writeE2ECapabilityReport,
} from './capabilities.mjs'
import { applyRequiredLocalMigrations } from './local-db-migrations.mjs'
import { startLocalAiProvider } from './local-ai-provider.mjs'
import { startLocalResendProvider } from './local-resend-provider.mjs'
import {
  decideServiceCleanup,
  hasAnyExplicitConfiguration,
} from './lifecycle-policy.mjs'
import {
  buildE2ERunManifest,
  summarizePlaywrightReport,
  writeE2ERunManifest,
} from './evidence-manifest.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const rootDirectory = path.resolve(scriptDirectory, '..', '..')
const runtimeDirectory = path.join(rootDirectory, '.devctl')
const devctlPath = path.join(rootDirectory, 'devctl.sh')
const playwrightPath = path.join(rootDirectory, 'node_modules', '.bin', 'playwright')
const evidenceDirectory = path.join(rootDirectory, '.harnesskit', 'evidence', 'comprehensive-site-e2e')
const runManifestPath = path.join(evidenceDirectory, 'run-manifest.json')
const { loadEnvConfig } = nextEnv

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      env: options.env ?? process.env,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`))
      else resolve(code ?? 1)
    })
  })
}

async function readJsonReport(target) {
  try {
    return JSON.parse(await readFile(target, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const runId = randomUUID()
  const runEvidenceDirectory = path.join(evidenceDirectory, 'runs', runId)
  const capabilityReportPath = path.join(runEvidenceDirectory, 'capabilities.json')
  const fixtureReportPath = path.join(runEvidenceDirectory, 'fixture-lifecycle.json')
  const playwrightResultsPath = path.join(runEvidenceDirectory, 'results.json')
  const immutableManifestPath = path.join(runEvidenceDirectory, 'run-manifest.json')
  const startedAt = new Date().toISOString()
  let exitCode = 1
  let phase = 'bootstrap'
  let failure = null
  let cleanupFailed = false
  let ownedLifecycle = false
  let localAi = null
  let localFundMail = null

  try {
    loadEnvConfig(rootDirectory)
    if (!existsSync(playwrightPath)) {
      throw new Error('Playwright is not installed. Run npm install before the E2E suite.')
    }

    const stateBefore = await readState(runtimeDirectory)
    ownedLifecycle = stateBefore === null
    const explicitProvider = hasAnyExplicitConfiguration(process.env, [
      'E2E_INVESTMENT_PROVIDER',
      'E2E_INVESTMENT_PROVIDER_API_KEY',
      'E2E_INVESTMENT_PROVIDER_MODEL',
      'E2E_INVESTMENT_PROVIDER_BASE_URL',
    ])
    localAi = explicitProvider ? null : await startLocalAiProvider()
    const providerEnvironment = localAi
      ? {
          E2E_INVESTMENT_PROVIDER: 'ollama',
          E2E_INVESTMENT_PROVIDER_MODEL: 'reporting-e2e',
          E2E_INVESTMENT_PROVIDER_BASE_URL: localAi.baseUrl,
          // The disposable provider is loopback-only. Make that private-egress
          // exception explicit for both the app and Playwright helper process.
          ALLOW_PRIVATE_OLLAMA_EGRESS: 'true',
        }
      : {}
    const explicitFundMail = hasAnyExplicitConfiguration(process.env, [
      'RESEND_BASE_URL',
      'E2E_RESEND_API_KEY',
      'E2E_RESEND_CONTROL_URL',
      'E2E_RESEND_CONTROL_TOKEN',
    ])
    localFundMail = explicitFundMail ? null : await startLocalResendProvider()
    const fundMailEnvironment = localFundMail
      ? {
          RESEND_BASE_URL: localFundMail.baseUrl,
          E2E_RESEND_API_KEY: localFundMail.apiKey,
          E2E_RESEND_CONTROL_URL: localFundMail.controlUrl,
          E2E_RESEND_CONTROL_TOKEN: localFundMail.controlToken,
        }
      : {}
    const serviceEnvironment = {
      ...process.env,
      ...providerEnvironment,
      ...fundMailEnvironment,
    }

    phase = 'services'
    const lifecycleAction = ownedLifecycle ? 'start' : 'restart'
    const startCode = await run(devctlPath, [lifecycleAction], { env: serviceEnvironment })
    if (startCode !== 0) throw new Error(`devctl ${lifecycleAction} failed with exit code ${startCode}`)

    phase = 'migrations'
    await applyRequiredLocalMigrations({
      rootDirectory,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    })

    const state = await readState(runtimeDirectory)
    const webPort = state?.ports?.web
    if (!Number.isInteger(webPort)) throw new Error('devctl did not publish a valid Web port')
    const cronSecret = await readExistingSecret(runtimeDirectory, 'cron_secret', process.env.CRON_SECRET)
    if (!cronSecret) throw new Error('devctl did not publish a usable Cron secret')

    phase = 'capabilities'
    const capabilities = await collectE2ECapabilities({
      env: serviceEnvironment,
      runtimeDirectory,
    })
    await writeE2ECapabilityReport({ ...capabilities, runId }, capabilityReportPath)
    assertRequiredE2ECapabilities(capabilities)

    const testEnvironment = {
      ...process.env,
      ...providerEnvironment,
      ...fundMailEnvironment,
      E2E_BASE_URL: process.env.E2E_BASE_URL ?? `http://localhost:${webPort}`,
      E2E_DEVCTL_RUNTIME_DIR: runtimeDirectory,
      FUND_WORKSPACE_DEV_PORT: process.env.FUND_WORKSPACE_DEV_PORT ?? String(webPort),
      E2E_CAPABILITIES_FILE: capabilityReportPath,
      E2E_EVIDENCE_DIR: runEvidenceDirectory,
      E2E_RUN_ID: runId,
      E2E_FIXTURE_REPORT_PATH: fixtureReportPath,
      // Passed only to the test process so it can drive the real dispatcher;
      // capability reports and browser artifacts never receive the value.
      CRON_SECRET: cronSecret,
    }
    phase = 'playwright'
    exitCode = await run(playwrightPath, ['test', ...process.argv.slice(2)], {
      env: testEnvironment,
    })
  } catch (error) {
    failure = error
    exitCode = 1
  } finally {
    const cleanupAction = decideServiceCleanup({
      ownedLifecycle,
      keepServices: process.env.E2E_KEEP_SERVICES === '1',
      injectedProviders: Boolean(localAi || localFundMail),
    })
    if (cleanupAction === 'stop') {
      const stopCode = await run(devctlPath, ['stop'])
      if (stopCode !== 0) {
        process.stderr.write(`Warning: devctl stop exited with ${stopCode}\n`)
        cleanupFailed = true
        exitCode = exitCode || stopCode
      }
    } else if (cleanupAction === 'restore') {
      const restoreCode = await run(devctlPath, ['restart'], { env: process.env })
      if (restoreCode !== 0) {
        process.stderr.write(`Warning: devctl restore exited with ${restoreCode}\n`)
        cleanupFailed = true
        exitCode = exitCode || restoreCode
      }
    }
    const providerCleanup = await Promise.allSettled([
      ...(localAi ? [localAi.close()] : []),
      ...(localFundMail ? [localFundMail.close()] : []),
    ])
    if (providerCleanup.some(result => result.status === 'rejected')) {
      cleanupFailed = true
      exitCode = exitCode || 1
    }
    const [capabilityReport, fixtureReport, playwrightReport] = await Promise.all([
      readJsonReport(capabilityReportPath),
      readJsonReport(fixtureReportPath),
      readJsonReport(playwrightResultsPath),
    ])
    const validCapabilities = capabilityReport?.runId === runId ? capabilityReport : null
    const validFixtures = fixtureReport?.runId === runId ? fixtureReport : null
    if (phase === 'playwright' && validFixtures) {
      const fixtureCleanupFailed = validFixtures.fixtures?.some(fixture => fixture.cleanup !== 'passed')
      if (fixtureCleanupFailed) {
        cleanupFailed = true
        exitCode = exitCode || 1
      }
    }
    const manifestPhase = validFixtures?.setup === 'failed' ? 'fixtures' : phase
    const manifest = buildE2ERunManifest({
      runId,
      startedAt,
      completedAt: new Date().toISOString(),
      exitCode,
      phase: manifestPhase,
      cleanupFailed,
      failureMessage: failure instanceof Error ? failure.message : failure,
      artifacts: {
        capabilityReport: path.relative(evidenceDirectory, capabilityReportPath),
        fixtureLifecycle: path.relative(evidenceDirectory, fixtureReportPath),
        playwrightResults: path.relative(evidenceDirectory, playwrightResultsPath),
        htmlReport: path.relative(evidenceDirectory, path.join(runEvidenceDirectory, 'html-report', 'index.html')),
        testResults: path.relative(evidenceDirectory, path.join(runEvidenceDirectory, 'test-results')),
      },
      capabilities: validCapabilities,
      fixtureLifecycle: validFixtures,
      scenarios: playwrightReport ? summarizePlaywrightReport(playwrightReport) : null,
    })
    await writeE2ERunManifest(manifest, immutableManifestPath)
    await writeE2ERunManifest(manifest, runManifestPath)
  }

  if (failure) throw failure
  process.exitCode = exitCode
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
