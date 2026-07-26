import { TRENDING_STRATEGY_VERSION } from './config'
import { deepFreeze, type TrendingMetrics } from './contracts'

const HOUR_MS = 60 * 60 * 1_000
const CURRENT_WINDOW_HOURS = 24
const BASELINE_WINDOW_DAYS = 7
const RETENTION_HOURS = CURRENT_WINDOW_HOURS + BASELINE_WINDOW_DAYS * 24

export type TrendingTagKind = 'industry' | 'technology' | 'theme' | 'event'

export interface TrendingObservation {
  readonly entryId: number
  readonly contentHash: string
  readonly sourceRef: string
  readonly publishedAt: string
  readonly tags: readonly {
    readonly kind: TrendingTagKind
    readonly label: string
    readonly normalizedLabel: string
  }[]
}

export interface TrendingCandidate {
  readonly resultKey: string
  readonly label: string
  readonly score: number
  readonly strategyVersion: typeof TRENDING_STRATEGY_VERSION
  readonly metrics: TrendingMetrics
  readonly entryIds: readonly number[]
  readonly sourceRefs: readonly string[]
}

interface Bucket {
  kind: TrendingTagKind
  normalizedLabel: string
  labels: Set<string>
  currentByHash: Map<string, TrendingObservation>
  baselineHashes: Set<string>
}

export function calculateTrending(
  observations: readonly TrendingObservation[],
  now: Date,
): readonly TrendingCandidate[] {
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs)) throw new Error('Trending calculation requires a valid clock')
  const buckets = new Map<string, Bucket>()

  for (const observation of observations) {
    const publishedMs = Date.parse(observation.publishedAt)
    const ageHours = (nowMs - publishedMs) / HOUR_MS
    if (!Number.isFinite(ageHours) || ageHours < 0 || ageHours >= RETENTION_HOURS) continue
    for (const tag of observation.tags) {
      const normalizedLabel = normalizeLabel(tag.normalizedLabel)
      if (!normalizedLabel) continue
      const key = `${tag.kind}:${normalizedLabel}`
      const bucket = buckets.get(key) ?? {
        kind: tag.kind,
        normalizedLabel,
        labels: new Set<string>(),
        currentByHash: new Map<string, TrendingObservation>(),
        baselineHashes: new Set<string>(),
      }
      bucket.labels.add(normalizeDisplayLabel(tag.label))
      if (ageHours < CURRENT_WINDOW_HOURS) {
        const previous = bucket.currentByHash.get(observation.contentHash)
        if (!previous || Date.parse(previous.publishedAt) < publishedMs) {
          bucket.currentByHash.set(observation.contentHash, observation)
        }
      } else {
        bucket.baselineHashes.add(observation.contentHash)
      }
      buckets.set(key, bucket)
    }
  }

  const candidates: TrendingCandidate[] = []
  for (const [resultKey, bucket] of Array.from(buckets.entries())) {
    const current = Array.from(bucket.currentByHash.values())
    const sourceRefs = Array.from(new Set(current.map(item => item.sourceRef))).sort()
    if (current.length < 2 || sourceRefs.length < 2) continue
    const newestMs = Math.max(...current.map(item => Date.parse(item.publishedAt)))
    const metrics = calculateMetrics(current.length, sourceRefs.length, bucket.baselineHashes.size, nowMs, newestMs)
    candidates.push(deepFreeze({
      resultKey,
      label: Array.from(bucket.labels).sort(compareText)[0] ?? bucket.normalizedLabel,
      score: calculateScore(metrics),
      strategyVersion: TRENDING_STRATEGY_VERSION,
      metrics,
      entryIds: current.map(item => item.entryId).sort((left, right) => left - right),
      sourceRefs,
    }) as TrendingCandidate)
  }

  return deepFreeze(candidates.sort((left, right) =>
    right.score - left.score
    || right.metrics.sourceCount - left.metrics.sourceCount
    || right.metrics.articleCount - left.metrics.articleCount
    || compareText(left.resultKey, right.resultKey),
  )) as readonly TrendingCandidate[]
}

function calculateMetrics(
  articleCount: number,
  sourceCount: number,
  priorArticleCount: number,
  nowMs: number,
  newestMs: number,
): TrendingMetrics {
  const priorRate = priorArticleCount / BASELINE_WINDOW_DAYS
  const growth = priorRate > 0
    ? Math.max(0, (articleCount - priorRate) / priorRate)
    : articleCount
  const newestAgeHours = Math.max(0, (nowMs - newestMs) / HOUR_MS)
  return deepFreeze({
    articleCount,
    sourceCount,
    priorArticleCount,
    growth: round(growth, 4),
    freshness: round(Math.max(0, 1 - newestAgeHours / CURRENT_WINDOW_HOURS), 4),
    currentWindowHours: CURRENT_WINDOW_HOURS,
    baselineWindowDays: BASELINE_WINDOW_DAYS,
  }) as TrendingMetrics
}

function calculateScore(metrics: TrendingMetrics): number {
  const score = 40 * Math.min(metrics.sourceCount / 5, 1)
    + 30 * Math.min(metrics.growth / 5, 1)
    + 20 * Math.min(metrics.articleCount / 10, 1)
    + 10 * metrics.freshness
  return round(score, 2)
}

function normalizeLabel(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim().slice(0, 200)
}

function normalizeDisplayLabel(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 200)
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en', { sensitivity: 'base' })
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}
