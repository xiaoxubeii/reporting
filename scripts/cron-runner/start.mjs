#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

import { CRON_JOBS, findCronJob, loadCronRunnerConfig } from './config.mjs'
import { startHealthServer } from './health.mjs'
import { writeStructuredLog } from './runtime.mjs'
import { createCronService } from './service.mjs'

export function parseCliArgs(argv) {
  if (argv.length === 0) return Object.freeze({ mode: 'recurring' })
  if (argv.length === 1 && argv[0] === '--list') return Object.freeze({ mode: 'list' })
  if (argv.length === 2 && argv[0] === '--run') {
    const job = findCronJob(argv[1])
    if (!job) throw new Error(`Unknown cron job name: ${argv[1]}`)
    return Object.freeze({ mode: 'run', job })
  }
  throw new Error('Usage: npm run cron:start -- [--list | --run <job-name>]')
}

export async function main(dependencies = {}) {
  const argv = dependencies.argv ?? process.argv.slice(2)
  const env = dependencies.env ?? process.env
  const logger = dependencies.logger ?? writeStructuredLog
  const stdout = dependencies.stdout ?? process.stdout
  const processImpl = dependencies.processImpl ?? process
  const command = parseCliArgs(argv)

  if (command.mode === 'list') {
    stdout.write(`${JSON.stringify(CRON_JOBS.map(({ name, path, schedule, timezone, timeoutMs }) => ({
      name,
      path,
      schedule,
      timezone,
      timeoutMs,
    })), null, 2)}\n`)
    return 0
  }

  const config = loadCronRunnerConfig(env)
  const service = createCronService(config, {
    logger,
    fetchImpl: dependencies.fetchImpl,
  })

  if (command.mode === 'run') {
    try {
      await service.runOne(command.job)
      await service.shutdown('one-shot-complete')
      return 0
    } catch (error) {
      await service.shutdown('one-shot-failed')
      logger({
        event: 'cron.runner.one_shot_failed',
        job: command.job.name,
        error: safeErrorCode(error),
        ...(Number.isInteger(error?.statusCode) ? { statusCode: error.statusCode } : {}),
      })
      return 1
    }
  }

  service.start()
  let health
  try {
    health = await startHealthServer(config, service.snapshot, {
      createServerImpl: dependencies.createServerImpl,
    })
  } catch (error) {
    await service.shutdown('health-start-failed')
    throw error
  }

  logger({
    event: 'cron.runner.ready',
    healthHost: config.healthHost,
    healthPort: config.healthPort,
  })

  const signal = await waitForShutdownSignal(processImpl)
  const serviceShutdown = service.shutdown(signal)
  await health.close()
  await serviceShutdown
  return 0
}

function waitForShutdownSignal(processImpl) {
  return new Promise(resolve => {
    let resolved = false
    const finish = signal => {
      if (resolved) return
      resolved = true
      processImpl.removeListener('SIGTERM', onSigterm)
      processImpl.removeListener('SIGINT', onSigint)
      resolve(signal)
    }
    const onSigterm = () => finish('SIGTERM')
    const onSigint = () => finish('SIGINT')
    processImpl.once('SIGTERM', onSigterm)
    processImpl.once('SIGINT', onSigint)
  })
}

function safeErrorCode(error) {
  if (typeof error?.code === 'string' && /^[a-z_]+$/.test(error.code)) return error.code
  return 'unexpected_error'
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isMainModule()) {
  main().then(exitCode => {
    process.exitCode = exitCode
  }).catch(() => {
    writeStructuredLog({
      event: 'cron.runner.start_failed',
      error: 'invalid_configuration_or_runtime',
    })
    process.exitCode = 1
  })
}
