import type { SearchResponse } from '@/lib/search/contracts'

export interface SearchPageState {
  readonly query: string
  readonly selected: ReadonlySet<string>
  readonly submittedQuery: string | null
  readonly submittedSelection: readonly string[]
  readonly loading: boolean
  readonly response: SearchResponse | null
  readonly error: string | null
  readonly filtersOpen: boolean
}

export type SearchPageAction =
  | { readonly type: 'query_changed'; readonly query: string }
  | { readonly type: 'category_toggled'; readonly categoryId: string }
  | { readonly type: 'categories_replaced'; readonly categoryIds: readonly string[] }
  | { readonly type: 'filters_opened'; readonly open: boolean }
  | { readonly type: 'submit_started' }
  | { readonly type: 'submit_succeeded'; readonly response: SearchResponse }
  | { readonly type: 'submit_failed'; readonly message: string }
  | { readonly type: 'feed_state_changed'; readonly entryId: number; readonly isRead: boolean; readonly isSaved: boolean }

export function initialSearchPageState(defaultCategories: readonly string[]): SearchPageState {
  return Object.freeze({
    query: '',
    selected: new Set(defaultCategories),
    submittedQuery: null,
    submittedSelection: Object.freeze([]),
    loading: false,
    response: null,
    error: null,
    filtersOpen: false,
  })
}

export function searchPageReducer(state: SearchPageState, action: SearchPageAction): SearchPageState {
  switch (action.type) {
    case 'query_changed': return Object.freeze({ ...state, query: action.query, error: null })
    case 'category_toggled': {
      const selected = new Set(state.selected)
      if (selected.has(action.categoryId)) selected.delete(action.categoryId)
      else selected.add(action.categoryId)
      return Object.freeze({ ...state, selected, error: null })
    }
    case 'categories_replaced': return Object.freeze({ ...state, selected: new Set(action.categoryIds), error: null })
    case 'filters_opened': return Object.freeze({ ...state, filtersOpen: action.open })
    case 'submit_started': return Object.freeze({
      ...state,
      loading: true,
      error: null,
      submittedQuery: state.query.trim(),
      submittedSelection: Object.freeze(Array.from(state.selected)),
    })
    case 'submit_succeeded': return Object.freeze({ ...state, loading: false, response: action.response, error: null, filtersOpen: false })
    case 'submit_failed': return Object.freeze({ ...state, loading: false, error: action.message })
    case 'feed_state_changed': {
      if (!state.response) return state
      const results = Object.freeze(state.response.results.map(hit => hit.feedEntryId === action.entryId
        ? Object.freeze({ ...hit, isRead: action.isRead, isSaved: action.isSaved })
        : hit))
      return Object.freeze({ ...state, response: Object.freeze({ ...state.response, results }) })
    }
  }
}

export function requestFromState(state: SearchPageState) {
  return Object.freeze({
    query: state.query.trim(),
    categoryIds: Object.freeze(Array.from(state.selected)),
  })
}

export function isSearchStale(state: SearchPageState): boolean {
  if (!state.response || state.submittedQuery === null) return false
  if (state.query.trim() !== state.submittedQuery) return true
  const selected = Array.from(state.selected).sort()
  const submitted = [...state.submittedSelection].sort()
  return selected.length !== submitted.length || selected.some((value, index) => value !== submitted[index])
}
