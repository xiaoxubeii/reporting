import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MASSDEVICE_WEBSITE_DEFINITION,
  createMassDeviceAdapter,
  parseMassDeviceSearchHtml,
} from './massdevice'
import {
  TCTMD_WEBSITE_DEFINITION,
  createTctmdAdapter,
  parseTctmdSearchHtml,
} from './tctmd'

function fixture(name: string): string {
  return readFileSync(
    resolve(process.cwd(), 'lib/search/specialized/fixtures', name),
    'utf8',
  )
}

describe('TCTMD website adapter', () => {
  it('parses bounded plain-text results and rejects ads and off-domain links', () => {
    const candidates = parseTctmdSearchHtml(fixture('tctmd-search.html'))

    expect(candidates).toEqual([
      expect.objectContaining({
        origin: 'specialized',
        title: 'TAVR outcomes improve in contemporary practice',
        url: 'https://www.tctmd.com/news/tavr-outcomes-improve',
        snippet: 'A registry analysis reports durable outcomes & fewer complications.',
        publishedAt: '2026-07-18T00:00:00.000Z',
        source: { id: 'tctmd', label: 'TCTMD' },
      }),
    ])
    expect(candidates[0].title).not.toContain('<')
    expect(JSON.stringify(candidates)).not.toContain('evil.example')
    expect(JSON.stringify(candidates)).not.toContain('Sponsored webinar')
  })

  it('fails visibly when the registered result structure changes', () => {
    expect(() => parseTctmdSearchHtml(fixture('tctmd-structure-changed.html')))
      .toThrow('TCTMD search result structure changed.')
  })
})

describe('MassDevice website adapter', () => {
  it('accepts only fixed article hosts and root article paths', () => {
    const candidates = parseMassDeviceSearchHtml(fixture('massdevice-search.html'))

    expect(candidates).toEqual([
      expect.objectContaining({
        origin: 'specialized',
        title: 'FDA clears next-generation cardiac monitor',
        url: 'https://www.massdevice.com/fda-clears-next-generation-cardiac-monitor/',
        snippet: 'The wearable device adds continuous rhythm analysis.',
        publishedAt: '2026-07-17T14:30:00.000Z',
        source: { id: 'massdevice', label: 'MassDevice' },
      }),
    ])
    expect(JSON.stringify(candidates)).not.toContain('/category/')
    expect(JSON.stringify(candidates)).not.toContain('tracking.example')
  })

  it('enforces the five-result cap even when a larger limit is requested', () => {
    const card = (index: number) => `
      <article class="type-post search-result">
        <h2><a href="/device-story-${index}/">Device story ${index}</a></h2>
      </article>`
    const html = `<main class="search-results">${Array.from({ length: 8 }, (_, index) => card(index)).join('')}</main>`
    expect(parseMassDeviceSearchHtml(html, 99)).toHaveLength(5)
  })

  it('fails visibly when an allowed result loses its required title', () => {
    expect(() => parseMassDeviceSearchHtml(fixture('massdevice-structure-changed.html')))
      .toThrow('MassDevice search result structure changed.')
  })
})

describe('unapproved website transports', () => {
  it('keeps fixed HTTPS search policies and permits no redirects', () => {
    expect(TCTMD_WEBSITE_DEFINITION).toMatchObject({
      searchEndpoint: 'https://www.tctmd.com/search',
      queryParameter: 'search_api_fulltext',
      allowedSearchHosts: ['www.tctmd.com'],
      allowedSearchPath: '/search',
      allowedRedirectHosts: [],
    })
    expect(MASSDEVICE_WEBSITE_DEFINITION).toMatchObject({
      searchEndpoint: 'https://www.massdevice.com/',
      queryParameter: 's',
      allowedSearchHosts: ['www.massdevice.com'],
      allowedSearchPath: '/',
      allowedRedirectHosts: [],
    })
  })

  it.each([
    ['tctmd', createTctmdAdapter()],
    ['massdevice', createMassDeviceAdapter()],
  ] as const)('keeps %s unavailable without performing transport', async (_id, adapter) => {
    await expect(adapter.search(
      { query: 'cardiac device', limit: 5 },
      { fundId: 'fund-1', userId: 'user-1', signal: new AbortController().signal },
    )).rejects.toMatchObject({ code: 'unavailable', retryable: false })
  })
})
