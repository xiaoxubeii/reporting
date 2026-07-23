import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function flattenedKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [prefix]
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenedKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), 'utf8')
}

describe('system entry localization', () => {
  const english = JSON.parse(source('messages/en.json'))
  const chinese = JSON.parse(source('messages/zh-CN.json'))

  it('localizes the OAuth consent and error surface', () => {
    const oauth = [
      source('app/oauth/authorize/page.tsx'),
      source('app/oauth/authorize/consent-form.tsx'),
    ].join('\n')

    expect(flattenedKeys(chinese.OAuth).sort()).toEqual(flattenedKeys(english.OAuth).sort())
    expect(oauth).toContain("getTranslations('OAuth')")
    expect(oauth).toContain("useTranslations('OAuth')")
    expect(oauth).not.toContain('>Read your fund<')
    expect(oauth).not.toContain('>Make changes<')
    expect(oauth).not.toContain('>Allow<')
    expect(oauth).not.toContain('>Deny<')
  })

  it('localizes the tokenized pitch submission surface and metadata', () => {
    const submit = [
      source('app/submit/[token]/page.tsx'),
      source('app/submit/[token]/submit-form.tsx'),
    ].join('\n')

    expect(flattenedKeys(chinese.Submit).sort()).toEqual(flattenedKeys(english.Submit).sort())
    expect(submit).toContain("getTranslations('Submit')")
    expect(submit).toContain("useTranslations('Submit')")
    expect(submit).toContain('export async function generateMetadata')
    expect(submit).not.toContain('>Submission received<')
    expect(submit).not.toContain('>Submit pitch<')
    expect(submit).not.toContain('placeholder="What do you do')
  })

  it('localizes the authenticated update status and instructions', () => {
    const updates = source('app/(app)/updates/page.tsx')

    expect(flattenedKeys(chinese.Updates).sort()).toEqual(flattenedKeys(english.Updates).sort())
    expect(updates).toContain("getTranslations('Updates')")
    expect(updates).toContain("getTranslations('Updates.metadata')")
    expect(updates).toContain('format.dateTime(')
    expect(updates).not.toContain('toLocaleDateString()')
    expect(updates).not.toContain('>A new version is available!<')
    expect(updates).not.toContain('>How to Update<')
  })

  it('localizes the interactions page and its page-level list', () => {
    const interactions = [
      source('app/(app)/interactions/page.tsx'),
      source('app/(app)/interactions/interactions-content.tsx'),
      source('app/(app)/interactions/relationships-list.tsx'),
    ].join('\n')

    expect(flattenedKeys(chinese.Interactions).sort()).toEqual(flattenedKeys(english.Interactions).sort())
    expect(interactions).toContain("getTranslations('Interactions.metadata')")
    expect(interactions).toContain("useTranslations('Interactions')")
    expect(interactions).not.toContain("toLocaleDateString('en-US'")
    expect(interactions).not.toContain('>No interactions yet<')
    expect(interactions).not.toContain('>Intro details<')
  })

  it('localizes pending Analyst actions and metadata', () => {
    const pendingActions = [
      source('app/(app)/pending-actions/page.tsx'),
      source('app/(app)/pending-actions/layout.tsx'),
    ].join('\n')

    expect(flattenedKeys(chinese.PendingActions).sort()).toEqual(flattenedKeys(english.PendingActions).sort())
    expect(pendingActions).toContain("useTranslations('PendingActions')")
    expect(pendingActions).toContain("getTranslations('PendingActions.metadata')")
    expect(pendingActions).not.toContain('toLocaleDateString()')
    expect(pendingActions).not.toContain('>Pending Actions<')
    expect(pendingActions).not.toContain('>Reject<')
  })

  it('localizes AI usage labels, activity actions, dates, numbers, and metadata', () => {
    const usage = [
      source('app/(app)/usage/page.tsx'),
      source('app/(app)/usage/usage-dashboard.tsx'),
    ].join('\n')

    expect(flattenedKeys(chinese.Usage).sort()).toEqual(flattenedKeys(english.Usage).sort())
    expect(usage).toContain("getTranslations('Usage.metadata')")
    expect(usage).toContain("useTranslations('Usage')")
    expect(usage).toContain('new Intl.NumberFormat(locale')
    expect(usage).not.toContain("toLocaleString('default'")
    expect(usage).not.toContain('>Daily Breakdown<')
    expect(usage).not.toContain('>Recent Activity<')
  })

  it('localizes LP activity filters, event labels, dates, counts, and metadata', () => {
    const lpActivity = [
      source('app/(app)/lp-activity/page.tsx'),
      source('app/(app)/lp-activity/lp-activity-dashboard.tsx'),
    ].join('\n')

    expect(flattenedKeys(chinese.LPActivity).sort()).toEqual(flattenedKeys(english.LPActivity).sort())
    expect(lpActivity).toContain("getTranslations('LPActivity.metadata')")
    expect(lpActivity).toContain("useTranslations('LPActivity')")
    expect(lpActivity).not.toContain('toLocaleString(undefined')
    expect(lpActivity).not.toContain('>LP Activity<')
    expect(lpActivity).not.toContain('>Authorized user<')
  })

  it('localizes the investments page, statuses, table labels, and metadata', () => {
    const investments = [
      source('app/(app)/investments/page.tsx'),
      source('app/(app)/investments/layout.tsx'),
    ].join('\n')

    expect(flattenedKeys(chinese.Investments).sort()).toEqual(flattenedKeys(english.Investments).sort())
    expect(investments).toContain("useTranslations('Investments')")
    expect(investments).toContain("getTranslations('Investments.metadata')")
    expect(investments).toContain('new Intl.Collator(locale)')
    expect(investments).not.toContain('>Portfolio Groups<')
    expect(investments).not.toContain('>All Statuses<')
    expect(investments).not.toContain('>Written Off<')
  })

  it('localizes notes, filters, relative dates, actions, and metadata', () => {
    const notes = [
      source('app/(app)/notes/page.tsx'),
      source('app/(app)/notes/layout.tsx'),
    ].join('\n')

    expect(flattenedKeys(chinese.Notes).sort()).toEqual(flattenedKeys(english.Notes).sort())
    expect(notes).toContain("useTranslations('Notes')")
    expect(notes).toContain("getTranslations('Notes.metadata')")
    expect(notes).not.toContain("toLocaleDateString('en-US'")
    expect(notes).not.toContain('>No notes found.<')
    expect(notes).not.toContain('placeholder="Write a reply')
  })

  it('localizes quarterly reporting asks, response tracking, and metadata', () => {
    const requests = [
      source('app/(app)/requests/page.tsx'),
      source('app/(app)/requests/response-tracker.tsx'),
      source('app/(app)/requests/layout.tsx'),
    ].join('\n')

    expect(flattenedKeys(chinese.Requests).sort()).toEqual(flattenedKeys(english.Requests).sort())
    expect(requests).toContain("useTranslations('Requests')")
    expect(requests).toContain("getTranslations('Requests.metadata')")
    expect(requests).not.toContain('>Create an Ask<')
    expect(requests).not.toContain('>Send test<')
    expect(requests).not.toContain('>Deselect all<')
  })

  it('localizes LP report cards, batch controls, filters, and metadata', () => {
    const lpCards = [
      source('app/(app)/lps/cards/page.tsx'),
      source('app/(app)/lps/cards/[investorId]/page.tsx'),
      source('app/(app)/lps/cards/layout.tsx'),
      source('components/lp-report-card.tsx'),
      source('components/lp-portfolio-group-filter.tsx'),
    ].join('\n')

    expect(flattenedKeys(chinese.LPs.cards).sort()).toEqual(flattenedKeys(english.LPs.cards).sort())
    expect(flattenedKeys(chinese.LPs.reportCard).sort()).toEqual(flattenedKeys(english.LPs.reportCard).sort())
    expect(lpCards).toContain("useTranslations('LPs.cards')")
    expect(lpCards).toContain("useTranslations('LPs.reportCard')")
    expect(lpCards).toContain("getTranslations('LPs.cards.metadata')")
    expect(lpCards).not.toContain('>Capital Summary<')
    expect(lpCards).not.toContain('>Combined PDF<')
    expect(lpCards).not.toContain('placeholder="Search investors')
  })
})
