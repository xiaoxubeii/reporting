import { describe, expect, it } from 'vitest'

import {
  buildDefaultAdapters,
  composePublishesPort,
  composeServicesHealthy,
  cronStopTimeout,
  dynamicRuntimeEnv,
} from '../scripts/devctl/adapters.mjs'

describe('devctl real adapter contracts', () => {
  it('builds adapters only for lifecycle-managed Web and Cron', () => {
    const adapters = buildDefaultAdapters({
      rootDir: process.cwd(),
      runtimeDir: '/tmp/reporting-devctl-test',
      env: {},
    })

    expect(Object.keys(adapters)).toEqual(['web', 'cron'])
  })

  it('requires every Compose service to be running and healthy', () => {
    const healthy = [
      { Service: 'database', State: 'running', Health: 'healthy' },
      { Service: 'miniflux', State: 'running', Health: 'healthy' },
    ].map(value => JSON.stringify(value)).join('\n')
    const unhealthy = JSON.stringify({ Service: 'miniflux', State: 'running', Health: 'unhealthy' })

    expect(composeServicesHealthy(healthy, ['database', 'miniflux'])).toBe(true)
    expect(composeServicesHealthy(unhealthy, ['miniflux'])).toBe(false)
    expect(composeServicesHealthy(JSON.stringify({ Service: 'miniflux', State: 'running', Health: '' }), ['miniflux'])).toBe(false)
    expect(composeServicesHealthy(JSON.stringify({ Service: 'miniflux', State: 'running', Health: 'starting' }), ['miniflux'])).toBe(false)
    expect(composeServicesHealthy('not-json', ['miniflux'])).toBe(false)
  })

  it('requires the expected host port publisher', () => {
    const output = JSON.stringify({
      Service: 'miniflux',
      Publishers: [{ URL: '127.0.0.1', TargetPort: 8080, PublishedPort: 5002, Protocol: 'tcp' }],
    })
    expect(composePublishesPort(output, 'miniflux', 5002)).toBe(true)
    expect(composePublishesPort(output, 'miniflux', 8085)).toBe(false)
  })

  it('derives only managed Web/Cron topology and never overrides external dependencies', () => {
    const env = dynamicRuntimeEnv({
      runtimeDir: '/tmp/reporting-devctl-test',
      ports: { web: 5000, cron: 5001 },
    })

    expect(env.CRON_RUNNER_BASE_URL).toBe('http://127.0.0.1:5000')
    expect(env.BACKGROUND_JOB_INTERNAL_ORIGIN).toBe('http://127.0.0.1:5000')
    for (const key of [
      'MINIFLUX_BASE_URL',
      'MINIFLUX_PROVISIONER_TOKEN_FILE',
      'MINIFLUX_ALLOW_INSECURE_HTTP',
      'MINIFLUX_PORT',
      'REPORTING_SEARXNG_URL',
      'REPORTING_SEARXNG_PORT',
      'REPORTING_SEARXNG_SECRET',
    ]) {
      expect(env).not.toHaveProperty(key)
    }
  })

  it('keeps the stop timeout beyond the configured Cron shutdown grace', () => {
    expect(cronStopTimeout({})).toBe(35_000)
    expect(cronStopTimeout({ CRON_RUNNER_SHUTDOWN_GRACE_MS: '120000' })).toBe(125_000)
  })
})
