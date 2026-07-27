import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = fs.readFileSync(path.join(root, 'components/experts/expert-directory.tsx'), 'utf8')
const en = JSON.parse(fs.readFileSync(path.join(root, 'messages/en.json'), 'utf8'))
const zh = JSON.parse(fs.readFileSync(path.join(root, 'messages/zh-CN.json'), 'utf8'))

describe('Expert Directory search toolbar', () => {
  it('uses an icon-led responsive directory search toolbar with a result count', () => {
    expect(source).toContain('function DirectorySearchToolbar(')
    expect(source).toContain('Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"')
    expect(source).toContain("t('results.count', { count: visibleExperts.length })")
    expect(source).toMatch(/directoryQuery\.trim\(\)[\s\S]*?\? t\('empty\.search'\)/)
  })

  it('provides matching English and Chinese toolbar copy', () => {
    expect(en.ExpertDirectory.results.count).toBeTruthy()
    expect(en.ExpertDirectory.empty.search).toBeTruthy()
    expect(zh.ExpertDirectory.results.count).toBeTruthy()
    expect(zh.ExpertDirectory.empty.search).toBeTruthy()
  })

  it('separates discovery parameters from candidate result filters', () => {
    expect(source).toContain('PopoverContent')
    expect(source).toContain('checked={sources.pubmed}')
    expect(source).toContain('checked={sources.clinical_trials}')
    expect(source).toContain('aria-labelledby="expert-discovery-sources-label"')
    expect(source).toContain('id="expert-discovery-sources-label"')
    expect(source).toContain('<Select value={candidateStatus}')
    expect(source).toContain("t('discovery.candidateCount', { count: visibleCandidates.length })")
    expect(source).not.toContain('<select id="expert-candidate-status"')
  })

  it('localizes the candidate result count', () => {
    expect(en.ExpertDirectory.discovery.candidateCount).toBeTruthy()
    expect(zh.ExpertDirectory.discovery.candidateCount).toBeTruthy()
  })
})
