import { describe, expect, it } from 'vitest'
import { initialSearchPageState, isSearchStale, requestFromState, searchPageReducer } from '@/components/search/state'

describe('search page state', () => {
  it('defaults only the supplied available sources and builds a fixed request', () => {
    const state = initialSearchPageState(['feeds', 'web'])
    const selected = searchPageReducer(state, { type: 'source_toggled', sourceId: 'pubmed' })
    expect(requestFromState({ ...selected, query: '  stent  ' })).toEqual({
      query: 'stent',
      sources: { feeds: true, web: true, specialized: ['pubmed'] },
    })
  })

  it('marks visible results stale when the query or sources change', () => {
    let state = initialSearchPageState(['feeds'])
    state = searchPageReducer({ ...state, query: 'heart' }, { type: 'submit_started' })
    state = searchPageReducer(state, { type: 'submit_succeeded', response: { results: [], sources: [], partial: false } })
    expect(isSearchStale(state)).toBe(false)
    expect(isSearchStale(searchPageReducer(state, { type: 'query_changed', query: 'heart valve' }))).toBe(true)
    expect(isSearchStale(searchPageReducer(state, { type: 'source_toggled', sourceId: 'web' }))).toBe(true)
  })

  it('keeps previous results visible during an explicit resubmission', () => {
    const response = { results: [], sources: [], partial: false }
    let state = initialSearchPageState(['web'])
    state = searchPageReducer({ ...state, query: 'device' }, { type: 'submit_started' })
    state = searchPageReducer(state, { type: 'submit_succeeded', response })
    state = searchPageReducer({ ...state, query: 'device safety' }, { type: 'submit_started' })
    expect(state.loading).toBe(true)
    expect(state.response).toBe(response)
  })

  it('applies a mobile source draft atomically', () => {
    const state = initialSearchPageState(['feeds', 'web'])
    const updated = searchPageReducer(state, {
      type: 'sources_replaced',
      sourceIds: ['pubmed'],
    })

    expect(Array.from(updated.selected)).toEqual(['pubmed'])
    expect(Array.from(state.selected)).toEqual(['feeds', 'web'])
  })

  it('immutably synchronizes Feed reader state into the matching result', () => {
    const response = {
      results: [
        { id: 'feed-7', primaryOrigin: 'feed' as const, origins: ['feed' as const], title: 'Feed', sources: [], feedEntryId: 7, isRead: false, isSaved: false },
        { id: 'web-1', primaryOrigin: 'web' as const, origins: ['web' as const], title: 'Web', sources: [] },
      ],
      sources: [],
      partial: false,
    }
    const initial = searchPageReducer(initialSearchPageState(['feeds']), {
      type: 'submit_succeeded',
      response,
    })
    const updated = searchPageReducer(initial, {
      type: 'feed_state_changed',
      entryId: 7,
      isRead: true,
      isSaved: true,
    })

    expect(updated.response?.results[0]).toMatchObject({ isRead: true, isSaved: true })
    expect(updated.response?.results[1]).toBe(response.results[1])
    expect(initial.response?.results[0]).toMatchObject({ isRead: false, isSaved: false })
  })
})
