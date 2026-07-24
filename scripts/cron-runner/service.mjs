import { Cron } from 'croner'

import { CRON_JOBS } from './config.mjs'
import { CronInvocationError, invokeCronJob, writeStructuredLog } from './runtime.mjs'

export function createCronService(config, dependencies = {}) {
  const CronClass = dependencies.CronClass ?? Cron
  const jobs = dependencies.jobs ?? CRON_JOBS
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch
  const logger = dependencies.logger ?? writeStructuredLog
  const scheduledJobs = []
  const activeRequests = new Set()
  const activeControllers = new Set()
  let started = false
  let ready = false
  let shuttingDown = false
  let shutdownPromise = null

  function snapshot() {
    return Object.freeze({
      ready,
      shuttingDown,
      jobCount: scheduledJobs.length,
      activeRequests: activeRequests.size,
    })
  }

  function start() {
    if (started) throw new Error('Cron service has already been started')
    if (shuttingDown) throw new Error('Cron service is shutting down')

    try {
      for (const job of jobs) {
        const scheduledJob = new CronClass(job.schedule, {
          name: job.name,
          timezone: job.timezone,
          protect: () => logger({
            event: 'cron.job.overrun_skipped',
            job: job.name,
          }),
          catch: () => logger({
            event: 'cron.job.handler_rejected',
            job: job.name,
          }),
        }, () => runTracked(job))
        scheduledJobs.push(scheduledJob)
      }
    } catch (error) {
      for (const scheduledJob of scheduledJobs) {
        try {
          scheduledJob.stop()
        } catch {
          // Preserve the registration error while still attempting every cleanup.
        }
      }
      scheduledJobs.length = 0
      logger({ event: 'cron.runner.start_failed' })
      throw error
    }

    started = true
    ready = true
    logger({
      event: 'cron.runner.started',
      jobCount: scheduledJobs.length,
      jobs: scheduledJobs.map((scheduledJob, index) => ({
        name: jobs[index].name,
        nextRun: scheduledJob.nextRun()?.toISOString() ?? null,
      })),
    })
    return snapshot()
  }

  function runOne(job) {
    if (!job) return Promise.reject(new Error('A declared cron job is required'))
    return runTracked(job)
  }

  function runTracked(job) {
    if (shuttingDown) {
      return Promise.reject(new CronInvocationError(
        `Cron job ${job.name} was not started because the runner is shutting down`,
        { code: 'shutdown' },
      ))
    }

    const controller = new AbortController()
    activeControllers.add(controller)
    const invocation = invokeCronJob(job, config, {
      fetchImpl,
      logger,
      controller,
    }).finally(() => {
      activeControllers.delete(controller)
      activeRequests.delete(invocation)
    })
    activeRequests.add(invocation)
    return invocation
  }

  function shutdown(signal = 'manual') {
    if (shutdownPromise) return shutdownPromise

    shuttingDown = true
    ready = false
    for (const scheduledJob of scheduledJobs) scheduledJob.stop()
    logger({
      event: 'cron.runner.stopping',
      signal,
      activeRequests: activeRequests.size,
    })

    shutdownPromise = finishShutdown(signal)
    return shutdownPromise
  }

  async function finishShutdown(signal) {
    const settledWithinGrace = await waitForActiveRequests(config.shutdownGraceMs)
    if (!settledWithinGrace) {
      logger({
        event: 'cron.runner.shutdown_grace_exceeded',
        activeRequests: activeRequests.size,
      })
      const reason = new CronInvocationError('Cron request aborted during runner shutdown', {
        code: 'shutdown',
      })
      for (const controller of activeControllers) controller.abort(reason)
      await waitForActiveRequests(1_000)
    }

    logger({
      event: 'cron.runner.stopped',
      signal,
      activeRequests: activeRequests.size,
    })
  }

  async function waitForActiveRequests(timeoutMs) {
    if (activeRequests.size === 0) return true

    let timer
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve(false), timeoutMs)
    })
    const settled = Promise.allSettled([...activeRequests]).then(() => true)
    try {
      return await Promise.race([settled, timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  return Object.freeze({
    start,
    runOne,
    shutdown,
    snapshot,
  })
}
