import { EXPERT_DISCOVERY_SOURCE_IDS, type ExpertDiscoverySourceId } from './types'

export class ExpertDiscoveryInputError extends Error {}

export function parseDiscoverySearch(value: unknown): { query: string; sourceIds: ExpertDiscoverySourceId[] } {
  const input = object(value)
  const query = text(input.query, 200, 'query')
  if (!Array.isArray(input.sourceIds) || input.sourceIds.length < 1 || input.sourceIds.length > 2) {
    throw new ExpertDiscoveryInputError('Select one or two discovery sources')
  }
  const sourceIds = Array.from(new Set(input.sourceIds))
  if (sourceIds.some(id => typeof id !== 'string' || !EXPERT_DISCOVERY_SOURCE_IDS.includes(id as ExpertDiscoverySourceId))) {
    throw new ExpertDiscoveryInputError('Unsupported discovery source')
  }
  return { query, sourceIds: sourceIds as ExpertDiscoverySourceId[] }
}

export function parseConfirmation(value: unknown) {
  const input = object(value)
  const email = text(input.email, 320, 'email').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ExpertDiscoveryInputError('A valid email is required')
  return {
    email,
    name: text(input.name, 160, 'name'),
    title: optionalText(input.title, 200),
    organization: optionalText(input.organization, 240),
    profileText: text(input.profileText, 6000, 'profileText'),
  }
}

export function parseRejection(value: unknown): { reason: string | null } {
  const input = object(value)
  return { reason: optionalText(input.reason, 500) || null }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ExpertDiscoveryInputError('A JSON object is required')
  return value as Record<string, unknown>
}

function text(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new ExpertDiscoveryInputError(`Invalid ${field}`)
  return value.trim()
}

function optionalText(value: unknown, max: number): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string' || value.trim().length > max) throw new ExpertDiscoveryInputError('Invalid text value')
  return value.trim()
}
