#!/usr/bin/env node

import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = new Map(process.argv.slice(2).flatMap((value, index, values) => (
  value.startsWith('--') && values[index + 1] && !values[index + 1].startsWith('--')
    ? [[value.slice(2), values[index + 1]]]
    : []
)))
const baseUrl = (args.get('base-url') ?? process.env.MINIFLUX_BASE_URL ?? '').replace(/\/+$/, '')
const feedUrl = args.get('feed-url') ?? ''
const categoryTitle = (args.get('category') ?? '').trim()
const tokenPath = resolve(args.get('token-file') ?? '.miniflux-secrets/explore_token')

if (!/^https:\/\//.test(baseUrl) && !/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(baseUrl)) {
  throw new Error('A valid HTTPS Miniflux URL or local 127.0.0.1 URL is required')
}
if (!/^https:\/\//.test(feedUrl)) throw new Error('A public HTTPS feed URL is required')
if (!categoryTitle || categoryTitle.length > 100) throw new Error('A category of 1 to 100 characters is required')

const token = await readPrivateToken(tokenPath)
const identity = await request('/v1/me')
if (identity?.username !== 'reporting_explore' || identity?.is_admin !== false || !positiveId(identity?.id)) {
  throw new Error('The configured token is not the Reporting Explore non-admin identity')
}

const categories = await request('/v1/categories')
if (!Array.isArray(categories)) throw new Error('Miniflux returned an invalid category list')
const category = categories.find(value => value?.title === categoryTitle)
  ?? await request('/v1/categories', {
    method: 'POST',
    body: JSON.stringify({ title: categoryTitle }),
  })
if (!positiveId(category?.id)) throw new Error('Miniflux returned an invalid category')

const feeds = await request('/v1/feeds')
if (!Array.isArray(feeds)) throw new Error('Miniflux returned an invalid feed list')
const existing = feeds.find(value => canonicalUrl(value?.feed_url) === canonicalUrl(feedUrl))
if (!existing) {
  const created = await request('/v1/feeds', {
    method: 'POST',
    body: JSON.stringify({ feed_url: feedUrl, category_id: category.id }),
  })
  if (!positiveId(created?.feed_id)) throw new Error('Miniflux returned an invalid feed result')
}

process.stdout.write(`${existing ? 'Already curated' : 'Curated'} ${new URL(feedUrl).hostname} in ${categoryTitle}.\n`)

async function readPrivateToken(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size > 4096 || (metadata.mode & 0o077) !== 0) {
      throw new Error('The Explore token file must be a private regular file')
    }
    const value = (await handle.readFile('utf8')).trim()
    if (!value || value.length > 2048) throw new Error('The Explore token is unavailable')
    return value
  } finally {
    await handle.close()
  }
}

async function request(path, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Auth-Token': token,
      },
    })
    if (!response.ok) throw new Error(`Miniflux curation failed with status ${response.status}`)
    return response.status === 204 ? null : await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function canonicalUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const parsed = new URL(value)
    parsed.hash = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function positiveId(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
