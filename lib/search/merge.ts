import { safeExternalHttpUrl } from '@/lib/feeds/url-policy'
import {
  MAX_SEARCH_RESULTS,
  SPECIALIZED_SOURCE_IDS,
  type SearchHit,
  type SearchIdentifiers,
  type SearchOrigin,
  type SearchSourceId,
} from './contracts'
import {
  MERGE_BUCKET_ORDER,
  ORIGIN_PRIORITY,
  type SearchCandidate,
} from './provider-contracts'
import { boundedPlainText, normalizedIsoDate } from './sanitize'

interface IndexedCandidate {
  readonly index: number
  readonly value: SearchCandidate
}

interface HitGroup {
  readonly firstIndex: number
  readonly bucket: SearchSourceId
  readonly hit: SearchHit
}

const SOURCE_IDS = new Set<SearchSourceId>(['feeds', 'web', ...SPECIALIZED_SOURCE_IDS])

export function mergeSearchCandidates(input: readonly SearchCandidate[]): readonly SearchHit[] {
  const candidates = input.flatMap((candidate, index) => {
    const value = normalizeCandidate(candidate)
    return value ? [{ index, value }] : []
  })
  const parents = candidates.map((_, index) => index)

  for (let left = 0; left < candidates.length; left += 1) {
    const leftKeys = duplicateKeys(candidates[left].value)
    if (leftKeys.size === 0) continue
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (setsIntersect(leftKeys, duplicateKeys(candidates[right].value))) {
        union(parents, left, right)
      }
    }
  }

  const grouped = new Map<number, IndexedCandidate[]>()
  candidates.forEach((candidate, index) => {
    const root = find(parents, index)
    grouped.set(root, [...(grouped.get(root) ?? []), candidate])
  })

  const buckets = new Map<SearchSourceId, HitGroup[]>()
  for (const members of Array.from(grouped.values())) {
    const group = buildHitGroup(members)
    buckets.set(group.bucket, [...(buckets.get(group.bucket) ?? []), group])
  }
  for (const groups of Array.from(buckets.values())) {
    groups.sort((a: HitGroup, b: HitGroup) => a.firstIndex - b.firstIndex)
  }

  const positions = new Map<SearchSourceId, number>()
  const results: SearchHit[] = []
  while (results.length < MAX_SEARCH_RESULTS) {
    let appended = false
    for (const sourceId of MERGE_BUCKET_ORDER) {
      const position = positions.get(sourceId) ?? 0
      const group = buckets.get(sourceId)?.[position]
      if (!group) continue
      results.push(group.hit)
      positions.set(sourceId, position + 1)
      appended = true
      if (results.length >= MAX_SEARCH_RESULTS) break
    }
    if (!appended) break
  }
  return Object.freeze(results)
}

function normalizeCandidate(candidate: SearchCandidate): SearchCandidate | null {
  const id = boundedPlainText(candidate.id, 240)
  const title = boundedPlainText(candidate.title, 500)
  const label = boundedPlainText(candidate.source?.label, 120)
  const sourceId = candidate.source?.id
  if (!id || !title || !label || !SOURCE_IDS.has(sourceId)) return null
  if (!originMatchesSource(candidate.origin, sourceId)) return null

  const url = canonicalSearchUrl(candidate.url)
  if (candidate.origin !== 'feed' && !url) return null
  const snippet = boundedPlainText(candidate.snippet, 800) ?? undefined
  const identifiers = normalizeIdentifiers(candidate.identifiers)
  const feedEntryId = Number.isSafeInteger(candidate.feedEntryId) && Number(candidate.feedEntryId) > 0
    ? candidate.feedEntryId
    : undefined
  if (candidate.origin === 'feed' && !feedEntryId) return null

  return Object.freeze({
    id,
    origin: candidate.origin,
    title,
    ...(url ? { url } : {}),
    ...(snippet ? { snippet } : {}),
    ...(normalizedIsoDate(candidate.publishedAt) ? { publishedAt: normalizedIsoDate(candidate.publishedAt) } : {}),
    source: Object.freeze({ id: sourceId, label }),
    ...(identifiers ? { identifiers } : {}),
    ...(feedEntryId ? { feedEntryId } : {}),
    ...(typeof candidate.isRead === 'boolean' ? { isRead: candidate.isRead } : {}),
    ...(typeof candidate.isSaved === 'boolean' ? { isSaved: candidate.isSaved } : {}),
  })
}

export function canonicalSearchUrl(value: unknown): string | null {
  const safe = safeExternalHttpUrl(value)
  if (!safe || safe.length > 4096) return null
  const url = new URL(safe)
  url.hash = ''
  const sorted = Array.from(url.searchParams.entries()).sort(([leftKey, leftValue], [rightKey, rightValue]) => (
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
  ))
  url.search = ''
  for (const [key, item] of sorted) url.searchParams.append(key, item)
  const normalized = url.toString()
  return url.pathname === '/' && !url.search ? normalized.replace(/\/$/, '') : normalized
}

function normalizeIdentifiers(value: SearchIdentifiers | undefined): SearchIdentifiers | undefined {
  if (!value) return undefined
  const doi = normalizeDoi(value.doi)
  const pmid = normalizePmid(value.pmid)
  const nct = normalizeNct(value.nct)
  const fdaId = normalizeFdaId(value.fdaId)
  const identifiers = {
    ...(doi ? { doi } : {}),
    ...(pmid ? { pmid } : {}),
    ...(nct ? { nct } : {}),
    ...(fdaId ? { fdaId } : {}),
  }
  return Object.keys(identifiers).length > 0 ? Object.freeze(identifiers) : undefined
}

function normalizeDoi(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const doi = value.trim().toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '')
  return /^10\.\d{4,9}\/\S{1,180}$/.test(doi) ? doi : null
}

function normalizePmid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const pmid = value.trim()
  return /^\d{1,12}$/.test(pmid) ? pmid : null
}

function normalizeNct(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const nct = value.trim().toUpperCase()
  return /^NCT\d{8}$/.test(nct) ? nct : null
}

function normalizeFdaId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const fdaId = value.trim().toUpperCase()
  return /^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(fdaId) ? fdaId : null
}

function duplicateKeys(candidate: SearchCandidate): ReadonlySet<string> {
  const keys = new Set<string>()
  if (candidate.url) keys.add(`url:${candidate.url}`)
  if (candidate.identifiers?.doi) keys.add(`doi:${candidate.identifiers.doi}`)
  if (candidate.identifiers?.pmid) keys.add(`pmid:${candidate.identifiers.pmid}`)
  if (candidate.identifiers?.nct) keys.add(`nct:${candidate.identifiers.nct}`)
  if (candidate.identifiers?.fdaId) keys.add(`fda:${candidate.identifiers.fdaId}`)
  return keys
}

function buildHitGroup(members: readonly IndexedCandidate[]): HitGroup {
  const primary = [...members].sort((left, right) => (
    ORIGIN_PRIORITY[left.value.origin] - ORIGIN_PRIORITY[right.value.origin]
      || left.index - right.index
  ))[0]
  const origins = Array.from(new Set(members.map(member => member.value.origin)))
    .sort((left, right) => ORIGIN_PRIORITY[left] - ORIGIN_PRIORITY[right])
  const sources = Array.from(new Map(members.map(member => [
    `${member.value.source.id}:${member.value.source.label}`,
    member.value.source,
  ])).values())
  const identifiers = mergeIdentifiers(members.map(member => member.value.identifiers))
  const feedMember = members.find(member => member.value.origin === 'feed')?.value
  const url = primary.value.url ?? members.find(member => member.value.url)?.value.url
  const hit: SearchHit = Object.freeze({
    id: primary.value.id,
    primaryOrigin: primary.value.origin,
    origins: Object.freeze(origins),
    title: primary.value.title,
    ...(url ? { url } : {}),
    ...(primary.value.snippet ? { snippet: primary.value.snippet } : {}),
    ...(primary.value.publishedAt ? { publishedAt: primary.value.publishedAt } : {}),
    sources: Object.freeze(sources.map(source => Object.freeze({ ...source }))),
    ...(identifiers ? { identifiers } : {}),
    ...(feedMember?.feedEntryId ? { feedEntryId: feedMember.feedEntryId } : {}),
    ...(typeof feedMember?.isRead === 'boolean' ? { isRead: feedMember.isRead } : {}),
    ...(typeof feedMember?.isSaved === 'boolean' ? { isSaved: feedMember.isSaved } : {}),
  })
  return Object.freeze({
    firstIndex: Math.min(...members.map(member => member.index)),
    bucket: primary.value.source.id,
    hit,
  })
}

function mergeIdentifiers(values: readonly (SearchIdentifiers | undefined)[]): SearchIdentifiers | undefined {
  const merged = values.reduce<SearchIdentifiers>((current, value) => ({
    ...current,
    ...(!current.doi && value?.doi ? { doi: value.doi } : {}),
    ...(!current.pmid && value?.pmid ? { pmid: value.pmid } : {}),
    ...(!current.nct && value?.nct ? { nct: value.nct } : {}),
    ...(!current.fdaId && value?.fdaId ? { fdaId: value.fdaId } : {}),
  }), {})
  return Object.keys(merged).length > 0 ? Object.freeze({ ...merged }) : undefined
}

function originMatchesSource(origin: SearchOrigin, sourceId: SearchSourceId): boolean {
  if (origin === 'feed') return sourceId === 'feeds'
  if (origin === 'web') return sourceId === 'web'
  return SPECIALIZED_SOURCE_IDS.includes(sourceId as never)
}

function setsIntersect(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return Array.from(left).some(value => right.has(value))
}

function find(parents: number[], index: number): number {
  if (parents[index] !== index) parents[index] = find(parents, parents[index])
  return parents[index]
}

function union(parents: number[], left: number, right: number): void {
  const leftRoot = find(parents, left)
  const rightRoot = find(parents, right)
  if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
}
