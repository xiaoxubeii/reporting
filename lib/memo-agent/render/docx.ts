import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx'
import yaml from 'js-yaml'
import type { MemoDraftOutput } from '@/lib/memo-agent/stages/draft'
import type { DimensionScore } from '@/lib/memo-agent/stages/score'
import type { DiligenceOutputLanguage } from '@/lib/diligence/output-language'

interface RenderInput {
  memo: MemoDraftOutput & { scores?: DimensionScore[] }
  memoOutputYaml: string
  isDraft: boolean
  dealName: string
  draftVersion: string
  outputLanguage: DiligenceOutputLanguage
  /** Base font family for the export. Defaults to DM Sans. */
  fontFamily?: string
  /** Base font size in points. Defaults to 11. */
  fontSize?: number
  /** Partner-defined section order/titles (incl. custom sections). Overrides the schema order when set. */
  sectionConfig?: Array<{ id: string; title: string; included?: boolean }>
}

const DEFAULT_FONT_FAMILY = 'DM Sans'
const DEFAULT_FONT_SIZE = 11

const FALLBACK_ORDER = [
  'header', 'executive_summary', 'recommendation', 'company_overview', 'product', 'market',
  'traction', 'business_model', 'team', 'competition_moat', 'outcomes_analysis', 'deal_terms',
  'risks_and_open_questions', 'scoring_summary', 'appendix',
  // Backward-compat for drafts produced under v0.1 of memo_output.yaml.
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
  const humanized = humanizeSectionId(id).toLocaleLowerCase()
  const defaultEnglish = DEFAULT_EN_SECTION_TITLES[id]?.toLocaleLowerCase()
  return normalized === humanized || normalized === defaultEnglish ? ZH_SECTION_TITLES[id] : title
}

/**
 * Word doc render. Reuses the docx library already in package.json (used by
 * lib/lp-letters/export.ts). Returns a Buffer suitable for upload to storage
 * or direct download.
 */
export async function renderDocx(input: RenderInput): Promise<Buffer> {
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
      sectionMeta.set(s.id, { id: s.id, title: s.title || meta?.title || humanizeSectionId(s.id), kind: meta?.kind ?? 'prose' })
    }
    for (const tail of ['scoring_summary', 'appendix']) {
      if (!baseOrder.includes(tail) && sectionMeta.has(tail)) baseOrder.push(tail)
    }
  } else {
    baseOrder = sections.length ? sections.map(s => s.id) : FALLBACK_ORDER
  }

  // Append any section_ids on paragraphs not in baseOrder so no content is hidden
  // (e.g. a section removed from the config that still has paragraphs).
  const paragraphSectionIds = Array.from(new Set(input.memo.paragraphs.map(p => p.section_id)))
  const extras = paragraphSectionIds.filter(id => !baseOrder.includes(id))
  const order = [...baseOrder, ...extras]
  // Fill in fallback meta for any section id in the order that wasn't defined
  // above — keeps the doc non-empty when the schema is empty or stale.
  for (const id of order) {
    if (!sectionMeta.has(id)) {
      sectionMeta.set(id, { id, title: localizedSectionTitle(id, humanizeSectionId(id), input.outputLanguage), kind: id === 'scoring_summary' || id === 'appendix' ? 'structured' : 'prose' })
    }
  }

  const paragraphsBySection = new Map<string, MemoDraftOutput['paragraphs']>()
  for (const p of input.memo.paragraphs) {
    if (!paragraphsBySection.has(p.section_id)) paragraphsBySection.set(p.section_id, [])
    paragraphsBySection.get(p.section_id)!.push(p)
  }

  const children: (Paragraph | Table)[] = []

  if (input.isDraft) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: zh ? '草稿 — 尚未定稿' : 'DRAFT — not finalized', bold: true, color: 'B8860B', size: 28 })],
    }))
    children.push(new Paragraph({ text: '' }))
  }

  // Header
  const header = input.memo.header ?? {}
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: header.company_name ?? input.dealName, bold: true })],
  }))
  const subBits = [header.sector, header.stage, header.round_size].filter(Boolean) as string[]
  if (subBits.length) {
    children.push(new Paragraph({
      children: [new TextRun({ text: subBits.join(' · '), italics: true })],
    }))
  }
  children.push(new Paragraph({ text: '' }))
  children.push(new Paragraph({
    children: [new TextRun({ text: `${zh ? '项目负责人' : 'Deal lead'}: ${header.deal_lead ?? (zh ? '[待合伙人填写]' : '[Partner to complete]')}` })],
  }))
  if (header.memo_date) children.push(new Paragraph({ children: [new TextRun({ text: `${zh ? '日期' : 'Date'}: ${header.memo_date}` })] }))
  children.push(new Paragraph({
    children: [new TextRun({ text: `${zh ? '版本' : 'Version'}: ${input.draftVersion} · ${zh ? '智能体' : 'Agent'}: ${header.agent_version ?? 'memo-agent v0.1'}`, color: '888888', size: 18 })],
  }))
  children.push(new Paragraph({ text: '' }))

  for (const sectionId of order) {
    if (sectionId === 'header') continue
    // The appendix is the citation list — intentionally omitted from the
    // Word / Google Doc export per fund preference.
    if (sectionId === 'appendix') continue
    const meta = sectionMeta.get(sectionId)
    if (!meta) continue

    if (meta.kind === 'structured' && sectionId === 'scoring_summary') {
      children.push(headingPara(meta.title))
      children.push(buildScoresTable(input.memo.scores ?? [], input.outputLanguage))
      children.push(new Paragraph({ text: '' }))
      continue
    }

    // Partner-hidden paragraphs are excluded from the render.
    const paragraphs = (paragraphsBySection.get(sectionId) ?? []).filter(p => !p.hidden)
    if (paragraphs.length === 0) continue

    children.push(headingPara(meta.title))

    paragraphs
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach(p => {
        const runs: TextRun[] = []
        const isPlaceholder = p.origin === 'partner_only_placeholder'
        runs.push(new TextRun({ text: p.prose, italics: isPlaceholder }))

        const markers: string[] = []
        if (p.contains_projection) markers.push(zh ? '预测' : 'projection')
        if (p.contains_unverified_claim) markers.push(zh ? '未验证' : 'unverified')
        if (p.contains_contradiction) markers.push(zh ? '存在矛盾' : 'contradiction')
        if (markers.length > 0) {
          runs.push(new TextRun({ text: ` (${markers.join(' · ')})`, italics: true, color: 'B8860B', size: 18 }))
        }

        children.push(new Paragraph({ children: runs }))
        children.push(new Paragraph({ text: '' }))
      })
  }

  const fontFamily = input.fontFamily?.trim() || DEFAULT_FONT_FAMILY
  const fontSizePt = input.fontSize && input.fontSize > 0 ? input.fontSize : DEFAULT_FONT_SIZE

  const doc = new Document({
    // Document-default run style. Body paragraphs inherit this; headings keep
    // their own sizes but inherit the font family. Size is in half-points.
    styles: {
      default: {
        document: {
          run: { font: fontFamily, size: fontSizePt * 2 },
        },
      },
    },
    sections: [{ children }],
  })
  return Buffer.from(await Packer.toBuffer(doc))
}

function headingPara(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text: title, bold: true })],
  })
}

function buildScoresTable(scores: DimensionScore[], language: DiligenceOutputLanguage): Table {
  const zh = language === 'zh-CN'
  const headerRow = new TableRow({
    children: (zh ? ['维度', '模式', '评分', '置信度', '理由'] : ['Dimension', 'Mode', 'Score', 'Confidence', 'Rationale']).map(t => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
      width: { size: 20, type: WidthType.PERCENTAGE },
    })),
  })
  const rows = [headerRow, ...scores.map(s => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph(s.dimension_id)] }),
      new TableCell({ children: [new Paragraph(zh ? ({ machine: '机器', hybrid: '混合', partner_only: '仅合伙人' }[s.mode] ?? s.mode) : s.mode)] }),
      new TableCell({ children: [new Paragraph(s.score === null ? (s.mode === 'partner_only' ? (zh ? '[合伙人]' : '[partner]') : '—') : String(s.score))] }),
      new TableCell({ children: [new Paragraph(zh && s.confidence ? ({ low: '低', medium: '中', high: '高' }[s.confidence] ?? s.confidence) : (s.confidence ?? '—'))] }),
      new TableCell({ children: [new Paragraph(s.rationale ?? '')] }),
    ],
  }))]
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'EEEEEE' },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'EEEEEE' },
    },
  })
}

function humanizeSectionId(id: string): string {
  return id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
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
