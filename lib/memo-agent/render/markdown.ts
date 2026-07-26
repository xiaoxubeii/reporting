import yaml from 'js-yaml'
import type { MemoDraftOutput } from '@/lib/memo-agent/stages/draft'
import type { DimensionScore } from '@/lib/memo-agent/stages/score'
import type { DiligenceOutputLanguage } from '@/lib/diligence/output-language'
import { buildSourceLabels, type SourceLabel, type SourceLabelInput } from './source-labels'

export interface RenderInput {
  memo: MemoDraftOutput & { scores?: DimensionScore[] }
  memoOutputYaml: string
  rubricYaml: string
  isDraft: boolean
  dealName: string
  draftVersion: string
  outputLanguage: DiligenceOutputLanguage
  /** Partner-defined section order/titles (incl. custom sections). Overrides the schema order when set. */
  sectionConfig?: Array<{ id: string; title: string; included?: boolean }>
  /**
   * Resolves each citation to the data-room document (or research source) behind it.
   * Omit and the appendix falls back to raw `type:id` — readable, but not checkable.
   */
  sources?: SourceLabelInput
}

const SECTION_FALLBACK_ORDER = [
  'header',
  'executive_summary',
  'recommendation',
  'company_overview',
  'product',
  'market',
  'traction',
  'business_model',
  'team',
  'competition_moat',
  'outcomes_analysis',
  'deal_terms',
  'risks_and_open_questions',
  'scoring_summary',
  'appendix',
  // Backward-compat: legacy schemas used 'product_technology' instead of 'product'.
  // Keep it in the fallback order so older drafts render in roughly the same slot.
  'product_technology',
]

const ZH_SECTION_TITLES: Record<string, string> = {
  executive_summary: '执行摘要',
  recommendation: '投资建议',
  company_overview: '公司概览',
  product: '产品',
  product_technology: '产品与技术',
  market: '市场',
  traction: '业务进展',
  business_model: '商业模式',
  team: '团队',
  competition_moat: '竞争与护城河',
  outcomes_analysis: '回报情景分析',
  deal_terms: '交易条款',
  risks_and_open_questions: '风险与待解问题',
  scoring_summary: '评分摘要',
  appendix: '附录与引用',
}

const DEFAULT_EN_SECTION_TITLES: Record<string, string> = {
  executive_summary: 'Executive Summary',
  recommendation: 'Recommendation',
  company_overview: 'Company Overview',
  product: 'Product',
  product_technology: 'Product Technology',
  market: 'Market',
  traction: 'Traction & Evidence',
  business_model: 'Business Model & Financials',
  team: 'Team',
  competition_moat: 'Competition & Moat',
  outcomes_analysis: 'Outcomes Analysis',
  deal_terms: 'Deal & Terms',
  risks_and_open_questions: 'Risks & Open Questions',
  scoring_summary: 'Scoring Summary',
  appendix: 'Appendix — Sources & Citations',
}

function localizedSectionTitle(id: string, title: string, language: DiligenceOutputLanguage): string {
  if (language !== 'zh-CN' || !ZH_SECTION_TITLES[id]) return title
  const normalized = title.trim().toLocaleLowerCase()
  const humanized = id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').toLocaleLowerCase()
  const defaultEnglish = DEFAULT_EN_SECTION_TITLES[id]?.toLocaleLowerCase()
  return normalized === humanized || normalized === defaultEnglish ? ZH_SECTION_TITLES[id] : title
}

/**
 * Markdown render of a memo draft.
 *
 * Conforms to memo_output.yaml's section order. Each prose paragraph carries
 * inline citation markers (`[1][2]…`) that resolve to the appendix citation
 * map at the bottom of the doc. Projections and unverified claims are
 * marked inline (`[projection]`, `⚠ unverified`).
 */
export function renderMarkdown(input: RenderInput): string {
  const sections = parseSections(input.memoOutputYaml)
  const sectionMeta = new Map(sections.map(s => [
    s.id,
    { ...s, title: localizedSectionTitle(s.id, s.title, input.outputLanguage) },
  ]))
  const zh = input.outputLanguage === 'zh-CN'

  // Section order + titles: partner section config when present (authoritative,
  // incl. custom + renamed sections), else the schema order. The structured tail
  // (scoring_summary, appendix) is always appended.
  let baseOrder: string[]
  if (input.sectionConfig && input.sectionConfig.length > 0) {
    const included = input.sectionConfig.filter(s => s.included !== false)
    baseOrder = included.map(s => s.id)
    for (const s of included) {
      const meta = sectionMeta.get(s.id)
      sectionMeta.set(s.id, { id: s.id, title: s.title || meta?.title || s.id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), kind: meta?.kind ?? 'prose' })
    }
    for (const tail of ['scoring_summary', 'appendix']) {
      if (!baseOrder.includes(tail) && sectionMeta.has(tail)) baseOrder.push(tail)
    }
  } else {
    baseOrder = sections.length ? sections.map(s => s.id) : SECTION_FALLBACK_ORDER
  }

  // Append section_ids from paragraphs that aren't in baseOrder so no content is hidden.
  const paragraphSectionIds = Array.from(new Set(input.memo.paragraphs.map(p => p.section_id)))
  const extras = paragraphSectionIds.filter(id => !baseOrder.includes(id))
  const sectionOrder = [...baseOrder, ...extras]
  // Fill in fallback meta for any section id in the order that the parsed
  // YAML didn't define — keeps render output non-empty when the schema is
  // missing or stale.
  for (const id of sectionOrder) {
    if (!sectionMeta.has(id)) {
      const fallbackTitle = id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      sectionMeta.set(id, { id, title: localizedSectionTitle(id, fallbackTitle, input.outputLanguage), kind: id === 'scoring_summary' || id === 'appendix' ? 'structured' : 'prose' })
    }
  }

  // Group paragraphs by section.
  const paragraphsBySection = new Map<string, typeof input.memo.paragraphs>()
  for (const p of input.memo.paragraphs) {
    if (!paragraphsBySection.has(p.section_id)) paragraphsBySection.set(p.section_id, [])
    paragraphsBySection.get(p.section_id)!.push(p)
  }

  const sourceLabels = buildSourceLabels(input.sources ?? {})

  // Build a stable citation key list as we walk paragraphs in order.
  const citationKeys: string[] = []
  function citeNumber(sourceType: string, sourceId: string): number {
    const key = `${sourceType}:${sourceId}`
    const idx = citationKeys.indexOf(key)
    if (idx >= 0) return idx + 1
    citationKeys.push(key)
    return citationKeys.length
  }

  const lines: string[] = []

  if (input.isDraft) lines.push(zh ? '# 草稿 — 尚未定稿' : '# DRAFT — not finalized', '')

  // Header
  const header = input.memo.header ?? {}
  lines.push(`# ${header.company_name ?? input.dealName}`)
  const headerBits: string[] = []
  if (header.sector) headerBits.push(header.sector)
  if (header.stage) headerBits.push(header.stage)
  if (header.round_size) headerBits.push(header.round_size)
  if (headerBits.length) lines.push(`*${headerBits.join(' · ')}*`)
  lines.push('')
  if (header.deal_lead) lines.push(`${zh ? '项目负责人' : 'Deal lead'}: ${header.deal_lead}`)
  else lines.push(zh ? '项目负责人: *[待合伙人填写]*' : 'Deal lead: *[Partner to complete]*')
  if (header.memo_date) lines.push(`${zh ? '日期' : 'Date'}: ${header.memo_date}`)
  lines.push(`${zh ? '版本' : 'Version'}: ${input.draftVersion} · ${zh ? '智能体' : 'Agent'}: ${header.agent_version ?? 'memo-agent v0.1'}`)
  lines.push('')

  for (const sectionId of sectionOrder) {
    if (sectionId === 'header') continue
    const meta = sectionMeta.get(sectionId)
    if (!meta) continue

    if (meta.kind === 'structured' && sectionId === 'scoring_summary') {
      lines.push(`## ${meta.title}`)
      lines.push('')
      lines.push(...renderScoresMarkdown(input.memo.scores ?? [], input.outputLanguage))
      lines.push('')
      continue
    }
    if (meta.kind === 'structured' && sectionId === 'appendix') {
      lines.push(`## ${meta.title}`)
      lines.push('')
      lines.push(...renderCitations(citationKeys, sourceLabels, input.outputLanguage))
      lines.push('')
      continue
    }

    // Partner-hidden paragraphs are excluded from the render.
    const paragraphs = (paragraphsBySection.get(sectionId) ?? []).filter(p => !p.hidden)
    if (paragraphs.length === 0) continue

    lines.push(`## ${meta.title}`)
    lines.push('')

    paragraphs
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach(p => {
        // Inline markers
        const markers: string[] = []
        if (p.contains_projection) markers.push(zh ? '[预测]' : '[projection]')
        if (p.contains_unverified_claim) markers.push(zh ? '⚠ 未验证' : '⚠ unverified')
        if (p.contains_contradiction) markers.push(zh ? '†存在矛盾' : '†contradiction')
        const markerSuffix = markers.length ? ` *${markers.join(' · ')}*` : ''

        let prose = p.prose
        if (p.origin === 'partner_only_placeholder') {
          prose = `*${prose}*`
        }

        // Citation footnotes
        const citationNumbers = (p.sources ?? [])
          .filter(s => s.source_type !== 'partner_only')
          .map(s => citeNumber(s.source_type, s.source_id))
        const cites = citationNumbers.length ? ' ' + citationNumbers.map(n => `[${n}]`).join('') : ''

        lines.push(`${prose}${cites}${markerSuffix}`)
        lines.push('')
      })
  }

  return lines.join('\n')
}

function renderScoresMarkdown(scores: DimensionScore[], language: DiligenceOutputLanguage): string[] {
  const zh = language === 'zh-CN'
  if (scores.length === 0) return [zh ? '*暂无评分。*' : '*No scores yet.*']
  const lines: string[] = []
  lines.push(zh ? '| 维度 | 模式 | 评分 | 置信度 | 理由 |' : '| Dimension | Mode | Score | Confidence | Rationale |')
  lines.push('|---|---|---|---|---|')
  for (const s of scores) {
    const score = s.score === null ? (s.mode === 'partner_only' ? (zh ? '*[合伙人]*' : '*[partner]*') : '—') : String(s.score)
    const mode = zh ? ({ machine: '机器', hybrid: '混合', partner_only: '仅合伙人' }[s.mode] ?? s.mode) : s.mode
    const conf = zh && s.confidence
      ? ({ low: '低', medium: '中', high: '高' }[s.confidence] ?? s.confidence)
      : (s.confidence ?? '—')
    const rationale = (s.rationale ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
    lines.push(`| ${s.dimension_id} | ${mode} | ${score} | ${conf} | ${rationale} |`)
  }
  return lines
}

function renderCitations(keys: string[], labels: Map<string, SourceLabel>, language: DiligenceOutputLanguage): string[] {
  if (keys.length === 0) return [language === 'zh-CN' ? '*暂无引用。*' : '*No citations.*']
  const zh = language === 'zh-CN'
  const lines: string[] = []
  keys.forEach((key, i) => {
    const [type, ...rest] = key.split(':')
    const id = rest.join(':')
    const hit = labels.get(key)
    // Name the data-room document the claim came from. A bare `claim:c_4f2a` is not a
    // citation — a reader can't check it. The id still rides along in code font so a
    // claim can be traced back to the ingestion output when someone needs to.
    if (hit) {
      const detail = hit.detail ? ` — ${hit.detail}` : ''
      const link = hit.url ? ` (<${hit.url}>)` : ''
      const label = zh
        ? ({ Research: '外部研究', 'Founder Q&A': '创始人问答' }[hit.label] ?? hit.label)
        : hit.label
      lines.push(`${i + 1}. **${label}**${detail}${link} · \`${type}:${id}\``)
    } else {
      const displayType = zh
        ? ({ claim: '数据室材料', finding: '外部研究', qa_answer: '问答', assumption: '假设', gap: '信息缺口' }[type] ?? type)
        : type
      lines.push(`${i + 1}. **${displayType}** — \`${type}:${id}\``)
    }
  })
  return lines
}

interface SectionMeta { id: string; title: string; kind?: string }
function parseSections(yamlText: string): SectionMeta[] {
  try {
    const parsed = yaml.load(yamlText) as any
    const sections = parsed?.memo_structure?.sections
    if (!Array.isArray(sections)) return []
    return sections.map((s: any) => ({ id: s.id, title: s.title ?? s.id, kind: s.kind }))
  } catch {
    return []
  }
}
