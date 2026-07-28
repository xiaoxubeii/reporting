import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { GET as expertPage } from '@/app/expert-response/route'
import {
  buildResearchClaimsContent,
  buildResearchCompetitorsContent,
  buildResearchFoundersContent,
} from '@/lib/memo-agent/prompts/research'
import type { IngestionOutput } from '@/lib/memo-agent/stages/ingest'

const root = process.cwd()
const migration = readFileSync(path.join(root, 'supabase/migrations/20260722010000_expert_validation.sql'), 'utf8')
const publicSubmit = readFileSync(path.join(root, 'lib/expert-validation/public.ts'), 'utf8')
const enqueueIngest = readFileSync(path.join(root, 'lib/diligence/enqueue-ingest.ts'), 'utf8')
const expertCreateRoute = readFileSync(path.join(root, 'app/api/experts/route.ts'), 'utf8')
const expertUpdateRoute = readFileSync(path.join(root, 'app/api/experts/[expertId]/route.ts'), 'utf8')
const candidateConfirmRoute = readFileSync(path.join(root, 'app/api/experts/discovery/[candidateId]/confirm/route.ts'), 'utf8')
const candidateRejectRoute = readFileSync(path.join(root, 'app/api/experts/discovery/[candidateId]/reject/route.ts'), 'utf8')
const diligenceDetail = readFileSync(path.join(root, 'app/(app)/diligence/[id]/deal-detail.tsx'), 'utf8')

describe('expert validation persistence contract', () => {
  it('keeps the validation request lifecycle separate from discovery review', () => {
    expect(migration).toContain("status in ('draft', 'invited', 'submitted')")
    expect(migration).not.toMatch(/create table public\.(expert_matching_runs|expert_reviews)/)
    expect(migration).not.toMatch(/review_status|reviewed_at|reviewed_by|rejected_at|approval_status/)
  })

  it('uses exact cosine Top 5 and server-only directory access', () => {
    expect(migration).toContain('e.embedding <=> p_query_embedding')
    expect(migration).toContain('limit least(greatest(coalesce(p_match_count, 5), 1), 5)')
    expect(migration).not.toMatch(/using hnsw|using ivfflat/i)
    expect(migration).toContain('revoke all on table public.experts from anon, authenticated')
  })

  it('serializes external Ingest enqueue decisions per Deal', () => {
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('enqueue_ingest_if_deal_idle')
    expect(migration).toContain("j.status in ('pending', 'running')")
    expect(enqueueIngest).toContain("admin.rpc('enqueue_ingest_if_deal_idle'")
    expect(enqueueIngest).not.toContain(".from('memo_agent_jobs')")
  })

  it('makes one-time submission a conditional atomic update', () => {
    expect(publicSubmit).toContain(".eq('status', 'invited')")
    expect(publicSubmit).toContain(".gt('expires_at', now)")
    expect(publicSubmit).toContain(".is('response_markdown', null)")
  })

  it('protects every expert mutation with same-origin JSON checks and bounded rate limits', () => {
    for (const route of [expertCreateRoute, expertUpdateRoute, candidateConfirmRoute, candidateRejectRoute]) {
      expect(route).toContain('assertSameOriginSearchRequest')
      expect(route).toContain('readSearchJson')
      expect(route).toContain('rateLimit')
      expect(route).toContain("databaseFailure: 'deny'")
    }
    expect(candidateConfirmRoute).toContain('error.status')
    expect(candidateRejectRoute).toContain('error.status')
  })
})

describe('isolated public response page', () => {
  it('has restrictive CSP, no-store, and no third-party analytics or browser persistence', async () => {
    const response = await expertPage(new NextRequest('https://reporting.example/expert-response'))
    const html = await response.text()
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'self'")
    expect(html).toContain("history.replaceState(null,'',location.pathname+location.search)")
    expect(html).not.toMatch(/vercel-insights|speed-insights|googletagmanager|fathom|analytics\.js/i)
    expect(html).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
  })

  it('renders the selected locale and preserves the fragment token only for a same-page reload', async () => {
    const response = await expertPage(new NextRequest('https://reporting.example/expert-response', {
      headers: { cookie: 'NEXT_LOCALE=zh-CN' },
    }))
    const html = await response.text()

    expect(html).toContain('<html lang="zh-CN">')
    expect(html).toContain('此邀请无效或已不可用。')
    expect(html).toContain('data-locale="en"')
    expect(html).toContain('data-locale="zh-CN"')
    expect(html).toContain("if(token)location.hash='token='+encodeURIComponent(token);location.reload()")
    expect(html).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
  })
})

describe('existing pipeline reuse', () => {
  const ingestion = {
    documents: [{
      document_id: 'expert-doc', detected_type: 'industry_expert', type_confidence: 'high',
      summary: 'An operator supplied direct evidence about factory yield.', issues: [],
      claims: [{ id: 'claim-1', field: 'factory_yield', value: '92%', context: 'Observed across three lines', verification_status: 'unverified', criticality: 'high', checklist_item_id: null }],
    }],
    gap_analysis: { missing: [], inadequate: [] }, cross_doc_flags: [],
  } as IngestionOutput

  it('feeds expert evidence to Claims but does not widen competitors or founders inputs', () => {
    const claims = buildResearchClaimsContent({ dealName: 'Deal', ingestion, webSearchEnabled: false })[0]
    const competitors = buildResearchCompetitorsContent({ dealName: 'Deal', ingestion, webSearchEnabled: false })[0]
    const founders = buildResearchFoundersContent({ dealName: 'Deal', ingestion, webSearchEnabled: false })[0]
    const text = (block: typeof claims) => block.type === 'text' ? block.text : ''
    expect(text(claims)).toContain('factory_yield')
    expect(text(competitors)).not.toContain('factory_yield')
    expect(text(founders)).not.toContain('factory_yield')
    expect(text(founders)).toContain('No team_bio or pitch_deck')
  })

  it('keeps Research manual and overwrites the existing single output', () => {
    const researchStage = readFileSync(path.join(root, 'lib/memo-agent/stages/research.ts'), 'utf8')
    const materializer = readFileSync(path.join(root, 'lib/expert-validation/materialize.ts'), 'utf8')
    expect(researchStage).toContain('.update({ research_output: persistedOutput as any })')
    expect(materializer).not.toMatch(/runResearch|kind:\s*['"]research['"]/)
  })

  it('reuses explicit-document incremental Ingest and its synthesis follow-up', () => {
    const ingestJob = readFileSync(path.join(root, 'lib/memo-agent/jobs/ingest-job.ts'), 'utf8')
    expect(ingestJob).toContain('payload.document_ids')
    expect(ingestJob).toContain('replaceExisting = !isExplicit')
    expect(ingestJob).toContain("kind: 'ingest_synthesis'")
  })
})

describe('internal expert validation workspace', () => {
  it('places expert validation in its own tab immediately after Research', () => {
    expect(diligenceDetail).toContain("'Research', 'Expert Validation', 'Scoring'")
    expect(diligenceDetail).toContain("activeTab === 'Expert Validation'")
    expect(diligenceDetail).toContain('<ExpertValidationTab dealId={deal.id}')
    expect(diligenceDetail).toContain('status?.latest_draft?.has_research')
    expect(diligenceDetail).toContain('onJumpToResearch')
    expect(diligenceDetail).toContain("aria-current={activeTab === t ? 'page' : undefined}")

    const researchTab = diligenceDetail.slice(
      diligenceDetail.indexOf('function ResearchTab('),
      diligenceDetail.indexOf('function ExpertValidationTab('),
    )
    expect(researchTab).not.toContain('<ExpertValidationPanel')
  })
})
