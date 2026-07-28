import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('global Assistant inventory', () => {
  it('mounts one shell-level host and only that host renders the panel', () => {
    const shell = fs.readFileSync(path.join(process.cwd(), 'components/app-shell.tsx'), 'utf8')
    const host = fs.readFileSync(path.join(process.cwd(), 'components/analyst-floating-host.tsx'), 'utf8')

    expect(shell.match(/<AnalystFloatingHost>/g)).toHaveLength(1)
    expect(shell.match(/<\/AnalystFloatingHost>/g)).toHaveLength(1)
    expect(host.match(/<AnalystPanel\s*\/>/g)).toHaveLength(1)

    const localConsumers = sourceFiles(path.join(process.cwd(), 'app'))
      .filter(file => fs.readFileSync(file, 'utf8').includes('<AnalystPanel'))
    expect(localConsumers).toEqual([])
  })

  it('keeps the dock contract in shared shell components instead of page-specific padding', () => {
    const shell = fs.readFileSync(path.join(process.cwd(), 'components/app-shell.tsx'), 'utf8')
    const host = fs.readFileSync(path.join(process.cwd(), 'components/analyst-floating-host.tsx'), 'utf8')
    const panel = fs.readFileSync(path.join(process.cwd(), 'components/analyst-panel.tsx'), 'utf8')
    const drawer = fs.readFileSync(path.join(process.cwd(), 'components/mobile-drawer-panel.tsx'), 'utf8')

    expect(host).toContain('xl:max-w-[1680px]')
    expect(host).toContain('data-testid="assistant-edge-launcher"')
    expect(host).toContain('data-testid="assistant-edge-drop-zone"')
    expect(panel).toContain('desktopMode="docked"')
    expect(drawer).toContain("'(min-width: 1280px)'")
    expect(drawer).toContain('w-[400px]')
    expect(drawer).toContain('max-w-[calc(100vw-1rem)]')

    for (const file of sourceFiles(path.join(process.cwd(), 'app'))) {
      expect(fs.readFileSync(file, 'utf8')).not.toContain('xl:pr-[400px]')
    }
    expect(shell).not.toContain('xl:pr-[400px]')
  })

  it('keeps trusted page-scope synchronizers independent from launchers', () => {
    const companyPage = fs.readFileSync(path.join(process.cwd(), 'app/(app)/companies/[id]/page.tsx'), 'utf8')
    const dealDetail = fs.readFileSync(path.join(process.cwd(), 'app/(app)/deals/[id]/deal-detail.tsx'), 'utf8')
    const scopeComponents = fs.readFileSync(path.join(process.cwd(), 'components/analyst-scope.tsx'), 'utf8')

    expect(companyPage).toContain('<AnalystCompanyScope companyId={company.id} />')
    expect(dealDetail).toContain('setDealId(deal.id)')
    expect(scopeComponents).toContain('setVehicle(group)')
    expect(scopeComponents).toContain('setDomain(domain)')
  })

  it('mounts one nonvisual diligence project scope without adding another assistant host', () => {
    const diligenceDetail = fs.readFileSync(path.join(process.cwd(), 'app/(app)/diligence/[id]/deal-detail.tsx'), 'utf8')
    const scopeComponents = fs.readFileSync(path.join(process.cwd(), 'components/analyst-scope.tsx'), 'utf8')

    expect(diligenceDetail.match(/<AnalystDiligenceScope\b/g)).toHaveLength(1)
    expect(diligenceDetail).toContain('<AnalystDiligenceScope dealId={deal.id} dealName={deal.name} />')
    expect(diligenceDetail).not.toContain('<AnalystFloatingHost')
    expect(diligenceDetail).not.toContain('<AnalystPanel')
    expect(scopeComponents).toContain('export function AnalystDiligenceScope')
    expect(scopeComponents).toContain('setDiligenceProject({ id: dealId, name: dealName })')
    expect(scopeComponents).toContain('setDiligenceProject(null)')
  })

  it('keeps diligence project history private, scope-checked, and legacy Q&A read-only', () => {
    const context = fs.readFileSync(path.join(process.cwd(), 'components/analyst-context.tsx'), 'utf8')
    const panel = fs.readFileSync(path.join(process.cwd(), 'components/analyst-panel.tsx'), 'utf8')
    const listRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/analyst/conversations/route.ts'), 'utf8')
    const detailRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/analyst/conversations/[id]/route.ts'), 'utf8')

    expect(context).toContain('`diligence:${diligenceDealId}`')
    expect(context).toContain('params.set(\'scope\', `diligence:${diligenceDealId}`)')
    expect(context).toContain('conv.read_only === true')
    expect(context).toContain("id.startsWith('legacy-diligence:')")
    expect(panel).toContain('diligenceDealId: diligenceDealId ?? undefined')
    expect(listRoute).toContain(".from('diligence_qa_chats')")
    expect(listRoute).toContain("`legacy-diligence:${diligenceDealId}`")
    expect(listRoute).toContain("title: '历史问答（旧版）'")
    expect(detailRoute).toContain("id.startsWith('legacy-diligence:')")
    expect(detailRoute).toContain(".from('diligence_qa_chats')")
    expect(detailRoute).toContain(".eq('scope', expected.scope)")
  })

  it('renders the current diligence project, evidence citations, and localized legacy history in the shared panel', () => {
    const panel = fs.readFileSync(path.join(process.cwd(), 'components/analyst-panel.tsx'), 'utf8')
    const context = fs.readFileSync(path.join(process.cwd(), 'components/analyst-context.tsx'), 'utf8')

    expect(panel).toContain('diligenceProjectName')
    expect(panel).toContain("t('currentProject', { project: diligenceProjectName })")
    expect(panel).toContain("t('evidenceSources')")
    expect(panel).toContain('msg.citations.map')
    expect(panel).toContain('citation.label')
    expect(panel).toContain("conv.read_only ? t('legacyDiligenceHistory') : conv.title")
    expect(panel).toContain('conv.read_only ? null :')
    expect(context).toContain('setReadOnlyHistory(conv.read_only === true)')
    expect(panel).toContain('disabled={readOnlyHistory}')
    expect(panel).toContain("t('startFromLegacy')")
  })

  it('binds the same diligence project scope on memo draft and legacy Q&A subpages', () => {
    for (const relativePath of [
      'app/(app)/diligence/[id]/drafts/[draftId]/page.tsx',
      'app/(app)/diligence/[id]/qa/page.tsx',
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
      expect(source).toContain('<AnalystDiligenceScope')
    }
  })

  it('removes the embedded diligence Q&A while preserving its read-only API migration path', () => {
    const diligenceDetail = fs.readFileSync(path.join(process.cwd(), 'app/(app)/diligence/[id]/deal-detail.tsx'), 'utf8')
    const legacyRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/diligence/[id]/qa-chat/route.ts'), 'utf8')

    expect(diligenceDetail).not.toContain('<QATab')
    expect(diligenceDetail).not.toContain('function QATab')
    expect(diligenceDetail).not.toContain('function QAChatBubble')
    expect(legacyRoute).toContain('export async function GET')
    expect(legacyRoute).not.toContain('export async function POST')
    expect(legacyRoute).not.toContain('export async function DELETE')
    expect(legacyRoute).toContain("hasAccess(access, 'diligence', 'read')")
  })

  it('keeps private assistant history and diligence evidence off the direct browser Data API', () => {
    const sql = fs.readFileSync(path.join(
      process.cwd(),
      'supabase/migrations/20260728020000_private_assistant_and_diligence_evidence.sql',
    ), 'utf8')
    expect(sql).toContain('REVOKE ALL ON TABLE public.analyst_conversations FROM anon, authenticated')
    expect(sql).toContain('user_id = auth.uid()')
    expect(sql).toContain('REVOKE ALL ON TABLE public.diligence_qa_chats FROM anon, authenticated')
    expect(sql).toContain('DROP POLICY IF EXISTS diligence_qa_chats_select')
    expect(sql).toContain('REVOKE ALL ON TABLE public.diligence_memo_drafts FROM anon, authenticated')
    expect(sql).toContain('DROP POLICY IF EXISTS diligence_memo_drafts_all')
    expect(sql).toContain('REVOKE ALL ON TABLE public.diligence_agent_sessions FROM anon, authenticated')
    expect(sql).toContain('DROP POLICY IF EXISTS diligence_agent_sessions_all')
  })

  it('keeps project Q&A read-only at the model boundary and gives the long-running route 60 seconds', () => {
    const analystRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/analyst/route.ts'), 'utf8')
    const qaAnswer = fs.readFileSync(path.join(process.cwd(), 'lib/diligence/qa-answer.ts'), 'utf8')
    const listRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/analyst/conversations/route.ts'), 'utf8')
    const detailRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/analyst/conversations/[id]/route.ts'), 'utf8')

    expect(analystRoute).toContain('export const maxDuration = 60')
    expect(analystRoute).toContain("hasAccess(access, 'diligence', 'write')")
    expect(analystRoute).toContain("hasAccess(access, 'relationships', 'read', 'interactions')")
    expect(analystRoute).toContain("hasAccess(access, 'relationships', 'read', 'notes')")
    expect(qaAnswer).toContain('tools: PROJECT_AFFINITY_TOOLS')
    expect(qaAnswer).toContain('makeProjectAffinityExecutor(affinityKey!, linkedOrgId!)')
    expect(qaAnswer).not.toContain('affinityMcpServer(')
    expect(listRoute).toContain("hasAccess(access, 'diligence', 'read')")
    expect(detailRoute).toContain("hasAccess(access, 'diligence', 'read')")
  })

  it('uses one row-locking RPC protocol for every Q&A evidence mutation', () => {
    const addRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/diligence/[id]/agent/qa/add-question/route.ts'), 'utf8')
    const entryRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/diligence/[id]/agent/qa/entry/route.ts'), 'utf8')
    const qaStage = fs.readFileSync(path.join(process.cwd(), 'lib/memo-agent/stages/qa.ts'), 'utf8')
    expect(addRoute).toContain("rpc('append_diligence_qa_answer'")
    expect(entryRoute).toContain("rpc('set_diligence_qa_answer_excluded'")
    expect(entryRoute).toContain("rpc('delete_diligence_qa_answer'")
    expect(qaStage).toContain("rpc('append_diligence_qa_session_messages'")
    expect(qaStage).toContain("rpc('append_diligence_partner_answers'")
    expect(qaStage).toContain("rpc('finish_diligence_qa_session'")
  })

  it('blocks remote Markdown images and unsafe assistant links', () => {
    const panel = fs.readFileSync(path.join(process.cwd(), 'components/analyst-panel.tsx'), 'utf8')
    expect(panel).toContain('img: () => null')
    expect(panel).toContain('/^(https?:|mailto:)/i.test(href)')
    expect(panel).toContain('rel="noopener noreferrer"')
  })

  it('treats the existing OpenAI-compatible provider as a configured assistant provider', () => {
    const appLayout = fs.readFileSync(path.join(process.cwd(), 'app/(app)/layout.tsx'), 'utf8')
    const layoutCache = fs.readFileSync(path.join(process.cwd(), 'lib/cache/layout.ts'), 'utf8')

    expect(layoutCache).toContain('openrouter_api_key_encrypted')
    expect(appLayout).toContain("fundSettings?.openrouter_api_key_encrypted ? 'openrouter' : null")
  })

  it('uses the shared compact assistant action on every repeated content surface', () => {
    const surfaces = [
      ['components/feeds/today-feed.tsx', 1],
      ['components/search/search-page.tsx', 1],
      ['components/experts/expert-directory.tsx', 1],
      ['app/(app)/dashboard/dashboard-companies.tsx', 1],
      ['app/(app)/deals/deals-content.tsx', 2],
    ] as const

    for (const [relativePath, expectedActions] of surfaces) {
      const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
      expect(source.match(/<AnalystContextActions\b/g)).toHaveLength(expectedActions)
      expect(source.match(/<AnalystContextActions\b[^>]*presentation="compact-hover"[^>]*\/>/g)).toHaveLength(expectedActions)
    }

    expect(fs.readFileSync(path.join(process.cwd(), 'components/search/search-page.tsx'), 'utf8'))
      .toContain('<article key={hit.id} className="group py-5">')
    expect(fs.readFileSync(path.join(process.cwd(), 'components/experts/expert-directory.tsx'), 'utf8'))
      .toContain('<article className="group rounded-lg border p-4">')
    expect(fs.readFileSync(path.join(process.cwd(), 'app/(app)/dashboard/dashboard-companies.tsx'), 'utf8'))
      .toContain('<article key={c.id} className="group relative rounded-lg border bg-card transition-colors hover:bg-accent/50">')

    const deals = fs.readFileSync(path.join(process.cwd(), 'app/(app)/deals/deals-content.tsx'), 'utf8')
    expect(deals).toContain('<tr key={d.id} className="group border-t hover:bg-muted/30">')
    expect(deals).toContain('className={`group rounded border bg-background p-2 cursor-grab')
  })
})

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(child)
    return entry.name.endsWith('.tsx') ? [child] : []
  })
}
