import { describe, expect, it, vi } from 'vitest'

import {
  CRON_JOBS,
  findCronJob,
  loadCronRunnerConfig,
} from '../scripts/cron-runner/config.mjs'
import { invokeCronJob } from '../scripts/cron-runner/runtime.mjs'
import { createCronService } from '../scripts/cron-runner/service.mjs'
import { createHealthHandler } from '../scripts/cron-runner/health.mjs'
import { main as runCronMain, parseCliArgs } from '../scripts/cron-runner/start.mjs'

const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  CRON_SECRET: 'test-secret-that-is-never-logged',
  CRON_RUNNER_BASE_URL: 'https://reporting.example.com',
}

type FakeCronOptions = {
  name?: string
  timezone?: string
  protect?: () => void
}

type FakeCronInstance = {
  pattern: string
  options: FakeCronOptions
  callback: () => unknown
  stop: ReturnType<typeof vi.fn>
}

describe('Croner production manifest', () => {
  it('preserves every former Vercel schedule and route in UTC', () => {
    expect(CRON_JOBS.map(({ name, path, schedule, timezone }) => ({
      name,
      path,
      schedule,
      timezone,
    }))).toEqual([
      {
        name: 'deals-digest',
        path: '/api/cron/deals-digest',
        schedule: '0 13 * * 1',
        timezone: 'UTC',
      },
      {
        name: 'memo-agent-worker',
        path: '/api/cron/memo-agent-worker',
        schedule: '*/3 * * * *',
        timezone: 'UTC',
      },
      {
        name: 'affinity-sync',
        path: '/api/cron/affinity-sync',
        schedule: '0 * * * *',
        timezone: 'UTC',
      },
      {
        name: 'deal-research',
        path: '/api/cron/deal-research',
        schedule: '*/10 * * * *',
        timezone: 'UTC',
      },
      {
        name: 'heartbeat-backfill',
        path: '/api/cron/heartbeat-backfill',
        schedule: '0 * * * *',
        timezone: 'UTC',
      },
    ])

    expect(CRON_JOBS.every(job => Object.isFrozen(job))).toBe(true)
    expect(Object.isFrozen(CRON_JOBS)).toBe(true)
  })

  it('finds only declared job names', () => {
    expect(findCronJob('deal-research')?.path).toBe('/api/cron/deal-research')
    expect(findCronJob('not-a-job')).toBeNull()
  })
})

describe('Croner production configuration', () => {
  it('normalizes a safe production origin and bounded lifecycle settings', () => {
    expect(loadCronRunnerConfig({
      ...VALID_ENV,
      CRON_RUNNER_BASE_URL: 'https://reporting.example.com/',
      CRON_RUNNER_HEALTH_HOST: '127.0.0.1',
      CRON_RUNNER_HEALTH_PORT: '3101',
      CRON_RUNNER_SHUTDOWN_GRACE_MS: '45000',
      CRON_RUNNER_REQUEST_TIMEOUT_MS: '420000',
    })).toEqual({
      baseUrl: 'https://reporting.example.com',
      secret: VALID_ENV.CRON_SECRET,
      healthHost: '127.0.0.1',
      healthPort: 3101,
      shutdownGraceMs: 45000,
      requestTimeoutMs: 420000,
    })
  })

  it.each([
    [{ ...VALID_ENV, CRON_SECRET: '' }, 'CRON_SECRET'],
    [{ ...VALID_ENV, CRON_SECRET: 'bad\nsecret' }, 'CRON_SECRET'],
    [{ ...VALID_ENV, CRON_SECRET: 'too-short' }, 'at least 32 characters'],
    [{ ...VALID_ENV, CRON_RUNNER_BASE_URL: '' }, 'CRON_RUNNER_BASE_URL'],
    [{ ...VALID_ENV, CRON_RUNNER_BASE_URL: 'https://user:pass@example.com' }, 'credentials'],
    [{ ...VALID_ENV, CRON_RUNNER_BASE_URL: 'https://example.com/base' }, 'origin'],
    [{ ...VALID_ENV, CRON_RUNNER_BASE_URL: 'http://private.internal' }, 'HTTPS'],
    [{ ...VALID_ENV, CRON_RUNNER_HEALTH_PORT: '0' }, 'CRON_RUNNER_HEALTH_PORT'],
    [{ ...VALID_ENV, CRON_RUNNER_REQUEST_TIMEOUT_MS: '999999999' }, 'CRON_RUNNER_REQUEST_TIMEOUT_MS'],
  ])('rejects invalid configuration before scheduling', (env, message) => {
    expect(() => loadCronRunnerConfig(env)).toThrow(message)
  })

  it('allows explicitly opted-in HTTP for a trusted private production network', () => {
    const config = loadCronRunnerConfig({
      ...VALID_ENV,
      CRON_RUNNER_BASE_URL: 'http://reporting-web:3000',
      CRON_RUNNER_ALLOW_INSECURE_HTTP: 'true',
    })

    expect(config.baseUrl).toBe('http://reporting-web:3000')
  })

  it('allows loopback HTTP outside production without an opt-in', () => {
    const config = loadCronRunnerConfig({
      ...VALID_ENV,
      NODE_ENV: 'development',
      CRON_RUNNER_BASE_URL: 'http://127.0.0.1:3000',
    })

    expect(config.baseUrl).toBe('http://127.0.0.1:3000')
  })
})

describe('authenticated cron invocation', () => {
  it('uses the existing GET bearer contract, rejects redirects, and logs no secret', async () => {
    const logger = vi.fn()
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input
      void init
      return new Response(null, { status: 204 })
    })
    const config = loadCronRunnerConfig(VALID_ENV)

    const result = await invokeCronJob(findCronJob('affinity-sync'), config, {
      fetchImpl,
      logger,
      now: (() => {
        let value = 1000
        return () => (value += 25)
      })(),
    })

    expect(result).toMatchObject({ ok: true, statusCode: 204, durationMs: 25 })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://reporting.example.com/api/cron/affinity-sync')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' })
    expect(init?.headers).toEqual({ authorization: `Bearer ${VALID_ENV.CRON_SECRET}` })
    expect(init?.signal).toBeInstanceOf(AbortSignal)

    const serializedLogs = JSON.stringify(logger.mock.calls)
    expect(serializedLogs).not.toContain(VALID_ENV.CRON_SECRET)
    expect(serializedLogs).not.toContain('authorization')
    expect(serializedLogs).not.toContain('reporting.example.com')
  })

  it('reports non-2xx responses without logging their body', async () => {
    const logger = vi.fn()
    const response = new Response('private upstream detail', { status: 503 })
    const cancelBody = vi.spyOn(response.body!, 'cancel')
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input
      void init
      return response
    })

    await expect(invokeCronJob(
      findCronJob('deal-research'),
      loadCronRunnerConfig(VALID_ENV),
      { fetchImpl, logger },
    )).rejects.toThrow('HTTP 503')

    const serializedLogs = JSON.stringify(logger.mock.calls)
    expect(serializedLogs).toContain('503')
    expect(serializedLogs).not.toContain('private upstream detail')
    expect(serializedLogs).not.toContain(VALID_ENV.CRON_SECRET)
    expect(cancelBody).toHaveBeenCalledOnce()
  })

  it('aborts a request at the configured timeout', async () => {
    const logger = vi.fn()
    const config = loadCronRunnerConfig({
      ...VALID_ENV,
      CRON_RUNNER_REQUEST_TIMEOUT_MS: '10',
    })
    const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      void input
      if (!init?.signal) throw new Error('Expected an AbortSignal')
      init.signal.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))

    await expect(invokeCronJob(
      findCronJob('heartbeat-backfill'),
      config,
      { fetchImpl, logger },
    )).rejects.toThrow(/timed out/i)

    expect(JSON.stringify(logger.mock.calls)).not.toContain(VALID_ENV.CRON_SECRET)
  })
})

describe('persistent Croner service lifecycle', () => {
  it('registers every manifest job with UTC and Croner overrun protection', () => {
    const instances: FakeCronInstance[] = []
    class FakeCron {
      pattern: string
      options: FakeCronOptions
      callback: () => unknown
      stop = vi.fn()

      constructor(pattern: string, options: FakeCronOptions, callback: () => unknown) {
        this.pattern = pattern
        this.options = options
        this.callback = callback
        instances.push(this)
      }

      nextRun() {
        return new Date('2030-01-01T00:00:00.000Z')
      }
    }

    const logger = vi.fn()
    const service = createCronService(loadCronRunnerConfig(VALID_ENV), {
      CronClass: FakeCron,
      logger,
    })
    const snapshot = service.start()

    expect(instances).toHaveLength(5)
    expect(instances.map(instance => ({
      pattern: instance.pattern,
      name: instance.options.name,
      timezone: instance.options.timezone,
      hasProtection: typeof instance.options.protect === 'function',
    }))).toEqual(CRON_JOBS.map(job => ({
      pattern: job.schedule,
      name: job.name,
      timezone: 'UTC',
      hasProtection: true,
    })))
    expect(snapshot).toMatchObject({ ready: true, shuttingDown: false, jobCount: 5 })

    instances[0].options.protect?.()
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({
      event: 'cron.job.overrun_skipped',
      job: 'deals-digest',
    }))
    expect(JSON.stringify(logger.mock.calls)).not.toContain(VALID_ENV.CRON_SECRET)
  })

  it('cleans up partially registered schedules when startup fails', () => {
    const firstStop = vi.fn()
    let registrations = 0
    class FailingCron {
      stop = firstStop

      constructor() {
        registrations += 1
        if (registrations === 2) throw new Error('registration failed')
      }

      nextRun() {
        return null
      }
    }

    const service = createCronService(loadCronRunnerConfig(VALID_ENV), {
      CronClass: FailingCron,
      logger: vi.fn(),
    })

    expect(() => service.start()).toThrow('registration failed')
    expect(firstStop).toHaveBeenCalledOnce()
    expect(service.snapshot()).toMatchObject({ ready: false, jobCount: 0 })
  })

  it('stops schedules and aborts work that exceeds shutdown grace', async () => {
    const instances: Array<{ stop: ReturnType<typeof vi.fn> }> = []
    class FakeCron {
      stop = vi.fn()
      constructor() {
        instances.push(this)
      }
      nextRun() {
        return null
      }
    }

    const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      void input
      if (!init?.signal) throw new Error('Expected an AbortSignal')
      init.signal.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const config = {
      ...loadCronRunnerConfig(VALID_ENV),
      shutdownGraceMs: 100,
      requestTimeoutMs: 60_000,
    }
    const service = createCronService(config, {
      CronClass: FakeCron,
      fetchImpl,
      logger: vi.fn(),
    })
    service.start()
    const invocation = service.runOne(findCronJob('memo-agent-worker'))

    await new Promise(resolve => setTimeout(resolve, 5))
    const shutdown = service.shutdown('SIGTERM')

    await expect(invocation).rejects.toThrow(/shutdown|aborted/i)
    await shutdown
    expect(instances.every(instance => instance.stop.mock.calls.length === 1)).toBe(true)
    expect(service.snapshot()).toMatchObject({
      ready: false,
      shuttingDown: true,
      activeRequests: 0,
    })
  })
})

describe('Croner health contract', () => {
  function responseRecorder() {
    const response = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      body: '',
      setHeader(name: string, value: string) {
        this.headers[name] = value
      },
      end(value = '') {
        this.body = value
      },
    }
    return response
  }

  it('reports liveness without exposing configuration', () => {
    const handler = createHealthHandler(() => ({
      ready: true,
      shuttingDown: false,
      jobCount: 5,
      activeRequests: 1,
      secret: VALID_ENV.CRON_SECRET,
      baseUrl: VALID_ENV.CRON_RUNNER_BASE_URL,
    }))
    const response = responseRecorder()

    handler({ method: 'GET', url: '/healthz' }, response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' })
    expect(response.body).not.toContain(VALID_ENV.CRON_SECRET)
    expect(response.body).not.toContain('reporting.example.com')
  })

  it('returns 503 readiness while shutting down and rejects other paths', () => {
    const handler = createHealthHandler(() => ({ ready: false, shuttingDown: true }))
    const readiness = responseRecorder()
    const missing = responseRecorder()

    handler({ method: 'GET', url: '/readyz' }, readiness)
    handler({ method: 'GET', url: '/status' }, missing)

    expect(readiness.statusCode).toBe(503)
    expect(JSON.parse(readiness.body)).toEqual({ status: 'not_ready' })
    expect(missing.statusCode).toBe(404)
  })

  it('rejects malformed request targets without throwing', () => {
    const getSnapshot = vi.fn(() => ({ ready: true }))
    const handler = createHealthHandler(getSnapshot)
    const response = responseRecorder()

    expect(() => handler({ method: 'GET', url: 'http://[' }, response)).not.toThrow()

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ error: 'invalid_request_target' })
    expect(getSnapshot).not.toHaveBeenCalled()
  })
})

describe('Croner command entrypoint', () => {
  it('supports recurring, list, and one-shot modes only', () => {
    expect(parseCliArgs([])).toEqual({ mode: 'recurring' })
    expect(parseCliArgs(['--list'])).toEqual({ mode: 'list' })
    expect(parseCliArgs(['--run', 'deal-research'])).toMatchObject({
      mode: 'run',
      job: { name: 'deal-research' },
    })
    expect(() => parseCliArgs(['--run', 'unknown'])).toThrow('Unknown cron job')
    expect(() => parseCliArgs(['--unexpected'])).toThrow('Usage:')
  })

  it('lists the immutable manifest without requiring production secrets', async () => {
    let output = ''
    const exitCode = await runCronMain({
      argv: ['--list'],
      env: {},
      stdout: { write: (value: string) => { output += value } },
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(output)).toEqual(CRON_JOBS)
    expect(output).not.toContain('CRON_SECRET')
  })

  it('uses the real invocation path for a named one-shot job', async () => {
    const logger = vi.fn()
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input
      void init
      return new Response(null, { status: 200 })
    })
    const exitCode = await runCronMain({
      argv: ['--run', 'deals-digest'],
      env: VALID_ENV,
      fetchImpl,
      logger,
    })

    expect(exitCode).toBe(0)
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0][0]).toBe('https://reporting.example.com/api/cron/deals-digest')
    expect(JSON.stringify(logger.mock.calls)).not.toContain(VALID_ENV.CRON_SECRET)
  })

  it('returns a failed one-shot exit code without leaking response content', async () => {
    const logger = vi.fn()
    const exitCode = await runCronMain({
      argv: ['--run', 'deals-digest'],
      env: VALID_ENV,
      fetchImpl: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        void input
        void init
        return new Response('sensitive body', { status: 500 })
      }),
      logger,
    })

    expect(exitCode).toBe(1)
    expect(JSON.stringify(logger.mock.calls)).not.toContain('sensitive body')
    expect(JSON.stringify(logger.mock.calls)).not.toContain(VALID_ENV.CRON_SECRET)
  })
})
