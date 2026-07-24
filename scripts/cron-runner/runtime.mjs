export class CronInvocationError extends Error {
  constructor(message, { code, statusCode = null } = {}) {
    super(message)
    this.name = 'CronInvocationError'
    this.code = code
    this.statusCode = statusCode
  }
}

export async function invokeCronJob(job, config, dependencies = {}) {
  if (!job) throw new Error('A declared cron job is required')

  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch
  const logger = dependencies.logger ?? writeStructuredLog
  const now = dependencies.now ?? Date.now
  const controller = dependencies.controller ?? new AbortController()
  const timeoutMs = config.requestTimeoutMs ?? job.timeoutMs
  const startedAt = now()
  let timedOut = false
  let failureLogged = false

  logger({
    event: 'cron.job.started',
    job: job.name,
    scheduledAt: new Date().toISOString(),
  })

  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new CronInvocationError(
      `Cron job ${job.name} timed out after ${timeoutMs}ms`,
      { code: 'timeout' },
    ))
  }, timeoutMs)

  try {
    const response = await fetchImpl(new URL(job.path, `${config.baseUrl}/`).toString(), {
      method: 'GET',
      headers: {
        authorization: `Bearer ${config.secret}`,
      },
      redirect: 'error',
      signal: controller.signal,
    })
    try {
      await response.body?.cancel()
    } catch {
      logger({
        event: 'cron.job.response_discard_failed',
        job: job.name,
      })
    }
    const durationMs = Math.max(0, now() - startedAt)

    if (!response.ok) {
      logger({
        event: 'cron.job.finished',
        job: job.name,
        outcome: 'error',
        error: 'http_status',
        statusCode: response.status,
        durationMs,
      })
      failureLogged = true
      throw new CronInvocationError(`Cron job ${job.name} returned HTTP ${response.status}`, {
        code: 'http_status',
        statusCode: response.status,
      })
    }

    logger({
      event: 'cron.job.finished',
      job: job.name,
      outcome: 'success',
      statusCode: response.status,
      durationMs,
    })
    return Object.freeze({
      ok: true,
      statusCode: response.status,
      durationMs,
    })
  } catch (error) {
    const durationMs = Math.max(0, now() - startedAt)
    if (error instanceof CronInvocationError) {
      if (!failureLogged) {
        logger({
          event: 'cron.job.finished',
          job: job.name,
          outcome: 'error',
          error: error.code ?? 'invocation_error',
          ...(Number.isInteger(error.statusCode) ? { statusCode: error.statusCode } : {}),
          durationMs,
        })
      }
      throw error
    }

    const aborted = controller.signal.aborted
    const code = timedOut ? 'timeout' : aborted ? 'aborted' : 'network_error'
    logger({
      event: 'cron.job.finished',
      job: job.name,
      outcome: 'error',
      error: code,
      durationMs,
    })

    if (timedOut && controller.signal.reason instanceof Error) {
      throw controller.signal.reason
    }
    throw new CronInvocationError(`Cron job ${job.name} request failed (${code})`, { code })
  } finally {
    clearTimeout(timeout)
  }
}

export function writeStructuredLog(record) {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...record,
  })}\n`)
}
