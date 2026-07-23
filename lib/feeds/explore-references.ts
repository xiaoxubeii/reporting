import { FeedApiError } from './errors'

type ExploreReferenceKind = 'category' | 'source' | 'entry'

const MAX_REFERENCE_LENGTH = 64

export function exploreCategoryRef(id: number): string {
  return createExploreRef('category', id)
}

export function exploreSourceRef(id: number): string {
  return createExploreRef('source', id)
}

export function exploreEntryRef(id: number): string {
  return createExploreRef('entry', id)
}

export function parseExploreCategoryRef(value: string): number {
  return parseExploreRef('category', value)
}

export function parseExploreSourceRef(value: string): number {
  return parseExploreRef('source', value)
}

export function parseExploreEntryRef(value: string): number {
  return parseExploreRef('entry', value)
}

function createExploreRef(kind: ExploreReferenceKind, id: number): string {
  if (!validId(id)) throw invalidReference()
  return `explore-${kind}:${id}`
}

function parseExploreRef(kind: ExploreReferenceKind, value: string): number {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_REFERENCE_LENGTH) {
    throw invalidReference()
  }
  const match = value.match(new RegExp(`^explore-${kind}:([1-9]\\d*)$`))
  if (!match) throw invalidReference()
  const id = Number(match[1])
  if (!validId(id) || String(id) !== match[1]) throw invalidReference()
  return id
}

function validId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function invalidReference(): FeedApiError {
  return new FeedApiError('invalid_request', 400, 'A valid Explore reference is required.')
}
