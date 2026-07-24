import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import yaml from 'js-yaml'

const composeText = readFileSync(new URL('../compose.searxng.yml', import.meta.url), 'utf8')
const settingsText = readFileSync(new URL('../searxng/settings.yml', import.meta.url), 'utf8')
interface SearchCompose {
  readonly name: string
  readonly networks: {
    readonly proxy: { readonly external: boolean; readonly name: string }
  }
  readonly services: {
    readonly searxng: {
      readonly image: string
      readonly ports: readonly string[]
      readonly restart: string
      readonly user: string
      readonly pids_limit: number
      readonly mem_limit: string
      readonly cpus: number
      readonly networks: readonly string[]
      readonly environment: { readonly SEARXNG_SECRET: string }
      readonly healthcheck: { readonly test: readonly string[] }
    }
  }
}

interface SearchSettings {
  readonly use_default_settings: { readonly engines: { readonly keep_only: readonly string[] } }
  readonly engines: readonly { readonly name: string; readonly disabled: boolean }[]
  readonly search: { readonly formats: readonly string[]; readonly safe_search: number }
  readonly server: { readonly method: string; readonly image_proxy: boolean; readonly public_instance: boolean }
  readonly outgoing: {
    readonly proxies: { readonly 'all://': readonly string[] }
  }
}

const compose = yaml.load(composeText) as SearchCompose
const settings = yaml.load(settingsText) as SearchSettings

const expectedEngines = [
  'bing',
  'duckduckgo',
  'brave',
  'startpage',
  'bing news',
  'duckduckgo news',
  'brave.news',
  'startpage news',
]

describe('Reporting-owned SearXNG deployment', () => {
  it('uses a digest-pinned independent loopback-only service', () => {
    const service = compose.services?.searxng
    expect(compose.name).toBe('reporting-search')
    expect(service.image).toMatch(/^docker\.io\/searxng\/searxng@sha256:[a-f0-9]{64}$/)
    expect(service.ports).toEqual(['127.0.0.1:${REPORTING_SEARXNG_PORT:-8086}:8080'])
    expect(JSON.stringify(compose)).not.toContain('refly_searxng')
    expect(service.restart).toBe('unless-stopped')
    expect(service.user).toBe('977:977')
    expect(service.pids_limit).toBe(256)
    expect(service.mem_limit).toBe('512m')
    expect(service.cpus).toBe(1)
    expect(service.environment.SEARXNG_SECRET).toContain('REPORTING_SEARXNG_SECRET')
  })

  it('health-checks the local process and proxy without performing an external search', () => {
    const test = compose.services.searxng.healthcheck.test.join(' ')
    expect(test).toContain('127.0.0.1:8080/healthz')
    expect(test).toContain('vpnserver-proxy')
    expect(test).toContain('8118')
    expect(test).not.toMatch(/\/search|q=/)
  })

  it('routes engine traffic directly to Privoxy on its Docker network', () => {
    expect(compose.services.searxng.networks).toEqual(['default', 'proxy'])
    expect(compose.networks.proxy).toEqual({ external: true, name: 'vpnserver-proxy_default' })
    expect(settings.outgoing.proxies['all://']).toEqual(['http://vpnserver-proxy:8118'])
    expect(JSON.stringify(compose.services.searxng)).not.toContain('host.docker.internal')
  })

  it('keeps only the approved General and News engine families', () => {
    expect(settings.use_default_settings.engines.keep_only).toEqual(expectedEngines)
    expect(settings.engines.map((engine: { name: string }) => engine.name)).toEqual(expectedEngines)
    expect(settings.engines.every((engine: { disabled: boolean }) => engine.disabled === false)).toBe(true)
  })

  it('allows JSON-only POST searches and disables remote image proxying', () => {
    expect(settings.search.formats).toEqual(['json'])
    expect(settings.search.safe_search).toBe(1)
    expect(settings.server.method).toBe('POST')
    expect(settings.server.image_proxy).toBe(false)
    expect(settings.server.public_instance).toBe(false)
  })
})
