import { describe, expect, it } from 'vitest'
import { initialSearchPageState, isSearchStale, requestFromState, searchPageReducer } from '@/components/search/state'

describe('search page state', () => {
  it('defaults supplied categories and builds a category-only request', () => {
    const state = initialSearchPageState(['subscriptions', 'internet'])
    const selected = searchPageReducer(state, { type: 'category_toggled', categoryId: 'research' })
    expect(requestFromState({ ...selected, query: '  stent  ' })).toEqual({
      query: 'stent',
      categoryIds: ['subscriptions', 'internet', 'research'],
    })
  })

  it('marks visible results stale when the query or sources change', () => {
    let state = initialSearchPageState(['subscriptions'])
    state = searchPageReducer({ ...state, query: 'heart' }, { type: 'submit_started' })
    state = searchPageReducer(state, { type: 'submit_succeeded', response: { results: [], sources: [], partial: false } })
    expect(isSearchStale(state)).toBe(false)
    expect(isSearchStale(searchPageReducer(state, { type: 'query_changed', query: 'heart valve' }))).toBe(true)
    expect(isSearchStale(searchPageReducer(state, { type: 'category_toggled', categoryId: 'internet' }))).toBe(true)
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
    const state = initialSearchPageState(['subscriptions', 'internet'])
    const updated = searchPageReducer(state, {
      type: 'categories_replaced',
      categoryIds: ['research'],
    })

    expect(Array.from(updated.selected)).toEqual(['research'])
    expect(Array.from(state.selected)).toEqual(['subscriptions', 'internet'])
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
