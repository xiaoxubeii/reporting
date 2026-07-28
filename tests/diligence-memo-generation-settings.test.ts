import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const panel = readFileSync(path.join(root, 'components/diligence/memo-config-panel.tsx'), 'utf8')
const stageGuidance = readFileSync(path.join(root, 'components/diligence/stage-guidance.tsx'), 'utf8')
const en = JSON.parse(readFileSync(path.join(root, 'messages/en.json'), 'utf8'))
const zh = JSON.parse(readFileSync(path.join(root, 'messages/zh-CN.json'), 'utf8'))

describe('memo generation settings disclosure', () => {
  it('uses a localized, collapsed summary with an explicit edit action', () => {
    expect(en.Diligence.memoConfig.title).toBe('Memo generation settings')
    expect(zh.Diligence.memoConfig.title).toBe('备忘录生成设置')
    expect(panel).toContain('const [open, setOpen] = useState(false)')
    expect(panel).toContain("{open ? t('closeSettings') : t('editSettings')}")
    expect(panel).toContain('aria-expanded={open}')
    expect(panel).toContain("{ label: t('summary.preset')")
    expect(panel).toContain("{ label: t('summary.style')")
    expect(panel).toContain("{ label: t('summary.persona')")
    expect(panel).toContain("t('summary.sectionsEnabled', { count: includedCount })")
  })

  it('groups detailed controls and keeps the section editor collapsed within edit mode', () => {
    expect(panel).toContain("t('groups.template.title')")
    expect(panel).toContain("t('groups.guidance.title')")
    expect(panel).toContain("t('groups.sections.title')")
    expect(panel).toContain('<details className="rounded-lg border" data-memo-section-editor>')
    expect(panel).toContain('rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground')
  })

  it('preserves memo persistence and keeps stage guidance as a separate contract', () => {
    expect(panel).toContain('partner_memo_guidance: partnerGuidance')
    expect(panel).toContain('memo_template_config: config')
    expect(panel).toContain('style_override: (styleOverride || null)')
    expect(panel).toContain('analyst_persona: persona')
    expect(panel).toContain("fetch(`/api/diligence/${dealId}/memo-config`")
    expect(panel).toContain("fetch('/api/diligence/memo-presets'")
    expect(panel).toContain("fetch('/api/diligence/prompts'")
    expect(stageGuidance).toContain('guidance: { [stage]: value }')
    expect(stageGuidance).not.toContain('memo_template_config')
  })
})
