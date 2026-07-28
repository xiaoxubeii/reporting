'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Loader2, Lock, Sparkles, Copy, Check, Save, FileText, Download, ExternalLink, ChevronDown, ChevronRight, MessageSquare, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFeatureVisibility, useIsAdmin } from '@/components/feature-visibility-context'
import { LpShareControl } from '@/components/lp-share-control'
import { sanitizeBasicHtml } from '@/lib/sanitize'

interface CompanyNarrative {
  company_id: string
  company_name: string
  narrative: string
  updated_by: string | null
  updated_at: string
}

interface CompanyPrompt {
  prompt: string
  mode: 'add' | 'replace'
}

interface Letter {
  id: string
  fund_id: string
  template_id: string | null
  period_year: number
  period_quarter: number
  is_year_end: boolean
  period_label: string
  portfolio_group: string
  portfolio_table_html: string | null
  company_narratives: CompanyNarrative[]
  full_draft: string | null
  generation_prompt: string | null
  generation_error: string | null
  company_prompts: Record<string, CompanyPrompt> | null
  status: string
  created_at: string
  updated_at: string
}

interface PortfolioPreviewData {
  fundName: string
  fundCurrency: string
  periodLabel: string
  portfolioGroup: string
  companies: {
    investment: {
      companyName: string
      status: string
      stage: string | null
      totalInvested: number
      totalRealized: number
      unrealizedValue: number
      fmv: number
      moic: number | null
    }
  }[]
  fundMetrics: {
    committedCapital: number
    paidInCapital: number
    distributions: number
    fmv: number
    dpi: number | null
    rvpi: number | null
    tvpi: number | null
    irr: number | null
  } | null
  totals: {
    totalInvested: number
    totalFmv: number
    totalRealized: number
    portfolioMoic: number | null
    activeCount: number
    exitedCount: number
    writtenOffCount: number
  }
}

export default function LetterEditorPage() {
  const format = useFormatter()
  const t = useTranslations('Letters.editor')
  const locale = useLocale()
  const fv = useFeatureVisibility()
  const isAdmin = useIsAdmin()
  const params = useParams()
  const letterId = params.id as string

  const [letter, setLetter] = useState<Letter | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [regeneratingAll, setRegeneratingAll] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingNarrative, setEditingNarrative] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [fullDraft, setFullDraft] = useState('')
  const [viewMode, setViewMode] = useState<'sections' | 'portfolio' | 'full'>('sections')
  const [exporting, setExporting] = useState<string | null>(null)
  const [googleDriveConnected, setGoogleDriveConnected] = useState(false)
  const [globalPromptOpen, setGlobalPromptOpen] = useState(false)
  const [globalPromptText, setGlobalPromptText] = useState('')
  const [savingGlobalPrompt, setSavingGlobalPrompt] = useState(false)
  const [promptPanelCompany, setPromptPanelCompany] = useState<string | null>(null)
  const [companyPromptText, setCompanyPromptText] = useState('')
  const [savingCompanyPrompt, setSavingCompanyPrompt] = useState(false)
  const [liveTableHtml, setLiveTableHtml] = useState<string | null>(null)
  const [loadingTable, setLoadingTable] = useState(false)
  const [previewData, setPreviewData] = useState<PortfolioPreviewData | null>(null)

  const loadLetter = useCallback(async () => {
    const res = await fetch(`/api/lp-letters/${letterId}`)
    if (res.ok) {
      const data = await res.json()
      setLetter(data)
      setFullDraft(data.full_draft ?? '')
      setGlobalPromptText(data.generation_prompt ?? t('defaultPrompt'))
    }
    setLoading(false)
  }, [letterId, t])

  // Load live portfolio table from preview endpoint
  const loadPortfolioTable = useCallback(async (l: Letter) => {
    setLoadingTable(true)
    try {
      const params = new URLSearchParams({
        year: String(l.period_year),
        quarter: String(l.period_quarter),
        group: l.portfolio_group,
        yearEnd: String(l.is_year_end),
      })
      const res = await fetch(`/api/lp-letters/preview?${params}`)
      if (res.ok) {
        const preview = await res.json()
        setPreviewData(preview)
        const statusLabels: Record<string, string> = {
          active: t('statuses.active'), exited: t('statuses.exited'), written_off: t('statuses.writtenOff'), 'written off': t('statuses.writtenOff'),
        }
        const html = buildTableHtml(preview, {
          company: t('portfolio.columns.company'), status: t('portfolio.columns.status'), stage: t('portfolio.columns.stage'),
          invested: t('portfolio.columns.invested'), fmv: t('portfolio.columns.fmv'), grossMoic: t('portfolio.columns.grossMoic'), total: t('portfolio.total'),
        }, locale, status => statusLabels[status.toLowerCase()] ?? status)
        setLiveTableHtml(html)
      }
    } catch {
      // Fall back to stored table
    } finally {
      setLoadingTable(false)
    }
  }, [locale, t])

  useEffect(() => {
    loadLetter()
  }, [loadLetter])

  // Load live portfolio table when letter is available
  useEffect(() => {
    if (letter) loadPortfolioTable(letter)
  }, [letter?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for updates when letter is generating server-side
  const letterStatus = letter?.status
  useEffect(() => {
    if (letterStatus !== 'generating') return
    const interval = setInterval(() => { loadLetter() }, 5000)
    return () => clearInterval(interval)
  }, [letterStatus, loadLetter])

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.googleDriveConnected) setGoogleDriveConnected(true)
      })
      .catch(() => {})
  }, [])

  const saveNarrative = async (companyId: string, text: string) => {
    if (!letter) return
    const narratives = [...(letter.company_narratives ?? [])]
    const idx = narratives.findIndex(n => n.company_id === companyId)
    if (idx >= 0) {
      narratives[idx] = { ...narratives[idx], narrative: text, updated_at: new Date().toISOString() }
    }

    setSaving(true)
    const res = await fetch(`/api/lp-letters/${letterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_narratives: narratives }),
    })
    if (res.ok) {
      const updated = await res.json()
      setLetter(updated)
    }
    setSaving(false)
    setEditingNarrative(null)
  }

  const saveFullDraft = async () => {
    setSaving(true)
    const res = await fetch(`/api/lp-letters/${letterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_draft: fullDraft }),
    })
    if (res.ok) {
      const updated = await res.json()
      setLetter(updated)
    }
    setSaving(false)
  }

  const regenerateCompany = async (companyId: string) => {
    setRegenerating(companyId)
    const res = await fetch(`/api/lp-letters/${letterId}/generate/${companyId}`, { method: 'POST' })
    if (res.ok) {
      await loadLetter()
    }
    setRegenerating(null)
  }

  const regenerateAll = async () => {
    setRegeneratingAll(true)
    const res = await fetch(`/api/lp-letters/${letterId}/generate`, { method: 'POST' })
    if (res.ok) {
      await loadLetter()
    }
    setRegeneratingAll(false)
  }

  const copyToClipboard = () => {
    const text = letter?.full_draft ?? fullDraft
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const exportLetter = async (format: 'markdown' | 'docx' | 'google-docs') => {
    setExporting(format)
    // Open the tab synchronously within the click so the browser doesn't block it
    // as a popup (window.open after an await is commonly blocked).
    const docWin = format === 'google-docs' ? window.open('about:blank', '_blank') : null
    try {
      const res = await fetch(`/api/lp-letters/${letterId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      })

      if (!res.ok) {
        docWin?.close()
        const err = await res.json().catch(() => ({ error: t('errors.export') }))
        alert(err.error ?? t('errors.export'))
        return
      }

      if (format === 'google-docs') {
        const { url } = await res.json()
        if (docWin) docWin.location.href = url
        else window.open(url, '_blank')
      } else {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const ext = format === 'docx' ? 'docx' : 'md'
        a.download = `${letter?.period_label ?? 'letter'}.${ext}`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      docWin?.close()
      alert(t('errors.export'))
    } finally {
      setExporting(null)
    }
  }

  const saveGlobalPrompt = async () => {
    setSavingGlobalPrompt(true)
    const res = await fetch(`/api/lp-letters/${letterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generation_prompt: globalPromptText || null }),
    })
    if (res.ok) {
      const updated = await res.json()
      setLetter(updated)
    }
    setSavingGlobalPrompt(false)
  }

  const saveCompanyPromptAndRegenerate = async (companyId: string) => {
    if (!letter) return
    setSavingCompanyPrompt(true)
    const existing = letter.company_prompts ?? {}
    const updated = { ...existing }
    if (companyPromptText.trim()) {
      updated[companyId] = { prompt: companyPromptText.trim(), mode: 'add' }
    } else {
      delete updated[companyId]
    }
    const res = await fetch(`/api/lp-letters/${letterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_prompts: updated }),
    })
    if (res.ok) {
      const data = await res.json()
      setLetter(data)
    }
    setSavingCompanyPrompt(false)
    setPromptPanelCompany(null)
    await regenerateCompany(companyId)
  }

  const openPromptPanel = (companyId: string) => {
    if (promptPanelCompany === companyId) {
      setPromptPanelCompany(null)
      return
    }
    const cp = letter?.company_prompts?.[companyId]
    setCompanyPromptText(cp?.prompt ?? '')
    setPromptPanelCompany(companyId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!letter) {
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">{t('notFound')}</p>
        <Link href="/letters" className="text-sm underline mt-2">{t('back')}</Link>
      </div>
    )
  }

  const narratives: CompanyNarrative[] = Array.isArray(letter.company_narratives) ? letter.company_narratives : []
  const hasContent = narratives.length > 0 || letter.full_draft
  const tableHtml = sanitizeBasicHtml(liveTableHtml ?? letter.portfolio_table_html)

  return (
    <div className="p-4 md:py-8 md:pl-8 md:pr-4 w-full">
      {/* Header */}
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          {fv.lp_letters === 'admin' && <Lock className="h-4 w-4 text-amber-500" />}{letter.period_label}
        </h1>
        <p className="text-sm text-muted-foreground">{letter.portfolio_group}</p>
      </div>

      {/* Tabs row with action buttons */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Tabs value={viewMode} onValueChange={v => setViewMode(v as 'sections' | 'portfolio' | 'full')}>
          <TabsList>
            <TabsTrigger value="sections">{t('tabs.sections')}</TabsTrigger>
            <TabsTrigger value="portfolio">{t('tabs.portfolio')}</TabsTrigger>
            <TabsTrigger value="full">{t('tabs.full')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" variant="outline" className="text-muted-foreground" onClick={copyToClipboard} title={t('copyTitle')}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
            {copied ? t('copied') : t('copy')}
          </Button>
          {hasContent && (
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground"
              onClick={() => exportLetter('docx')}
              disabled={!!exporting}
              title={t('downloadTitle')}
            >
              {exporting === 'docx' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
              {t('download')}
            </Button>
          )}
          {hasContent && googleDriveConnected && (
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground"
              onClick={() => exportLetter('google-docs')}
              disabled={!!exporting}
              title={t('googleDocsTitle')}
            >
              {exporting === 'google-docs' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <ExternalLink className="h-3.5 w-3.5 mr-1.5" />}
              Google Docs
            </Button>
          )}
          {/* Sharing into the portal is the portal's own switch — `lp_portal_access` was a second
              key for the same idea and has been folded into `lp_portal`. */}
          {isAdmin && (fv.lp_portal === 'everyone' || fv.lp_portal === 'admin') && (
            <LpShareControl shareEndpoint={`/api/lp-letters/${letterId}/share`} />
          )}
        </div>
      </div>

      {/* Analyst prompt editor, only on Edit Company Summaries tab */}
      {viewMode === 'sections' && <div className="rounded-lg border mb-4">
        <button
          onClick={() => setGlobalPromptOpen(!globalPromptOpen)}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-left text-sm hover:bg-muted/50"
        >
          {globalPromptOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="font-medium">{t('prompt.title')}</span>
          {letter.generation_prompt && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t('prompt.customized')}</span>
          )}
        </button>
        {globalPromptOpen && (
          <div className="px-4 pb-3 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              {t('prompt.description')}
            </p>
            <Textarea
              value={globalPromptText}
              onChange={e => setGlobalPromptText(e.target.value)}
              rows={6}
              className="text-sm"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={saveGlobalPrompt}
                disabled={savingGlobalPrompt || globalPromptText === (letter.generation_prompt ?? t('defaultPrompt'))}
              >
                {savingGlobalPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                {t('prompt.save')}
              </Button>
              <span className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                className="text-muted-foreground"
                onClick={regenerateAll}
                disabled={regeneratingAll}
                title={t('prompt.analyzeAllTitle')}
              >
                {regeneratingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                {t('prompt.analyzeAll')}
              </Button>
            </div>
          </div>
        )}
      </div>}

      {!hasContent && !regeneratingAll && letter.status === 'generating' && (
        <div className="rounded-lg border bg-muted/30 p-8 text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('generation.progress')}
          </p>
          <p className="text-xs text-muted-foreground/60">{t('generation.autoUpdate')}</p>
        </div>
      )}

      {!hasContent && !regeneratingAll && letter.status !== 'generating' && (
        <div className="rounded-lg border border-dashed p-12 text-center space-y-3">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
          {letter.generation_error ? (
            <>
              <p className="text-sm text-destructive">{t('generation.failed')}</p>
              <p className="text-xs text-muted-foreground">{letter.generation_error}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t('generation.empty')}</p>
              <p className="text-xs text-muted-foreground/60">{t('generation.emptyHint')}</p>
            </>
          )}
          {letter.generation_error && (
            <Button size="sm" variant="outline" onClick={regenerateAll}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              {t('generation.retry')}
            </Button>
          )}
        </div>
      )}

      {regeneratingAll && (
        <div className="rounded-lg border bg-muted/30 p-8 text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('generation.analyzingAll')}
          </p>
        </div>
      )}

      {/* Section view */}
      {viewMode === 'sections' && !regeneratingAll && (
        <div className="space-y-6">
          {/* Company narratives */}
          {hasContent && narratives.map(n => (
            <div key={n.company_id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm">{n.company_name}</h3>
                <div className="flex items-center gap-1.5">
                  {editingNarrative !== n.company_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2.5"
                      onClick={() => { setEditingNarrative(n.company_id); setEditText(n.narrative); setPromptPanelCompany(null) }}
                    >
                      <Pencil className="h-3 w-3 mr-1.5" />
                      {t('actions.edit')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={promptPanelCompany === n.company_id ? 'default' : 'outline'}
                    className="h-7 text-xs px-2.5"
                    onClick={() => { openPromptPanel(n.company_id); setEditingNarrative(null) }}
                  >
                    <MessageSquare className="h-3 w-3 mr-1.5" />
                    {t('actions.prompt')}
                    {letter.company_prompts?.[n.company_id] && promptPanelCompany !== n.company_id && (
                      <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex gap-0">
                {/* Main content area */}
                <div className={`min-w-0 ${promptPanelCompany === n.company_id ? 'flex-1' : 'w-full'}`}>
                  {editingNarrative === n.company_id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        rows={8}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveNarrative(n.company_id, editText)}
                          disabled={saving}
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                          {t('actions.save')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingNarrative(null)}>
                          {t('actions.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap text-muted-foreground leading-relaxed">
                      {regenerating === n.company_id ? (
                        <div className="flex items-center gap-2 py-4 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-xs">{t('generation.analyzingCompany')}</span>
                        </div>
                      ) : (
                        n.narrative
                      )}
                    </div>
                  )}
                </div>

                {/* Inline prompt panel (slides in from right within card) */}
                {promptPanelCompany === n.company_id && (
                  <div className="w-[280px] shrink-0 border-l ml-4 pl-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">{t('companyPrompt.title')}</p>
                      <button onClick={() => setPromptPanelCompany(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t('companyPrompt.description')}
                    </p>
                    <Textarea
                      value={companyPromptText}
                      onChange={e => setCompanyPromptText(e.target.value)}
                      placeholder={t('companyPrompt.placeholder')}
                      rows={5}
                      className="text-xs"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => saveCompanyPromptAndRegenerate(n.company_id)}
                        disabled={savingCompanyPrompt || regenerating === n.company_id}
                      >
                        {(savingCompanyPrompt || regenerating === n.company_id) ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                        ) : (
                          <Sparkles className="h-3 w-3 mr-1.5" />
                        )}
                        {t('companyPrompt.saveAnalyze')}
                      </Button>
                    </div>
                    {letter.company_prompts?.[n.company_id] && (
                      <button
                        className="text-[11px] text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          const existing = letter.company_prompts ?? {}
                          const updated = { ...existing }
                          delete updated[n.company_id]
                          const res = await fetch(`/api/lp-letters/${letterId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ company_prompts: updated }),
                          })
                          if (res.ok) {
                            const data = await res.json()
                            setLetter(data)
                            setCompanyPromptText('')
                          }
                        }}
                      >
                        {t('companyPrompt.clear')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground/50 mt-2">
                {t('lastUpdated', { date: format.dateTime(new Date(n.updated_at), { dateStyle: 'medium', timeStyle: 'short' }) })}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Portfolio data view */}
      {viewMode === 'portfolio' && (
        <div className="space-y-6">
          {loadingTable ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t('portfolio.loading')}</span>
            </div>
          ) : previewData ? (
            <>
              {/* Fund metrics table */}
              <div className="rounded-lg border p-4">
                <h2 className="font-medium text-sm mb-3">{t('portfolio.fundSummary')}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-2 py-1.5 font-semibold">{t('portfolio.columns.fund')}</th>
                        <th className="text-right px-2 py-1.5 font-semibold">{t('portfolio.columns.committed')}</th>
                        <th className="text-right px-2 py-1.5 font-semibold">{t('portfolio.columns.called')}</th>
                        <th className="text-right px-2 py-1.5 font-semibold">{t('portfolio.columns.distributions')}</th>
                        <th className="text-right px-2 py-1.5 font-semibold">{t('portfolio.columns.fmv')}</th>
                        <th className="text-right px-2 py-1.5 font-semibold">{t('portfolio.columns.dpi')}</th>
                        <th className="text-right px-2 py-1.5 font-semibold">{t('portfolio.columns.rvpi')}</th>
                        <th className="text-right px-2 py-1.5 font-semibold">{t('portfolio.columns.tvpi')}</th>
                        <th className="text-right px-2 py-1.5 font-semibold">{t('portfolio.columns.irr')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="px-2 py-1.5">
                          <div className="font-medium">{previewData.fundName}</div>
                          <div className="text-muted-foreground">{previewData.portfolioGroup}</div>
                        </td>
                        {previewData.fundMetrics ? (
                          <>
                            <td className="text-right px-2 py-1.5 font-mono">{fmtCurrency(previewData.fundMetrics.committedCapital, previewData.fundCurrency, locale)}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{fmtCurrency(previewData.fundMetrics.paidInCapital, previewData.fundCurrency, locale)}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{fmtCurrency(previewData.fundMetrics.distributions, previewData.fundCurrency, locale)}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{fmtCurrency(previewData.fundMetrics.fmv, previewData.fundCurrency, locale)}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{formatMoic(previewData.fundMetrics.dpi, locale)}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{formatMoic(previewData.fundMetrics.rvpi, locale)}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{formatMoic(previewData.fundMetrics.tvpi, locale)}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{formatPercent(previewData.fundMetrics.irr, locale)}</td>
                          </>
                        ) : (
                          <>
                            <td className="text-right px-2 py-1.5 font-mono">{'\u2014'}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{'\u2014'}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{'\u2014'}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{'\u2014'}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{'\u2014'}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{'\u2014'}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{'\u2014'}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{'\u2014'}</td>
                          </>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Portfolio company table */}
              {tableHtml && (
                <div className="rounded-lg border p-4">
                  <h2 className="font-medium text-sm mb-3">{t('portfolio.companies')}</h2>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none [&_table]:w-full [&_table]:text-xs [&_th]:px-2 [&_th]:py-1.5 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_td]:border [&_thead]:bg-muted/50"
                    dangerouslySetInnerHTML={{ __html: tableHtml }}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <p className="text-sm text-muted-foreground">{t('portfolio.empty')}</p>
            </div>
          )}
        </div>
      )}

      {/* Full draft view */}
      {viewMode === 'full' && hasContent && !regeneratingAll && (
        <div className="space-y-4">
          <Textarea
            value={fullDraft}
            onChange={e => setFullDraft(e.target.value)}
            rows={40}
            className="font-mono text-sm leading-relaxed"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={saveFullDraft}
              disabled={saving || fullDraft === letter.full_draft}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {t('draft.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFullDraft(letter.full_draft ?? '')}
              disabled={fullDraft === letter.full_draft}
            >
              {t('draft.revert')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Build portfolio table HTML from preview data (client-side, no AI)
// ---------------------------------------------------------------------------

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtCurrency(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

function formatMoic(value: number | null, locale: string): string {
  return value == null ? '\u2014' : `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}x`
}

function formatPercent(value: number | null, locale: string): string {
  return value == null ? '\u2014' : new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
}

function buildTableHtml(preview: {
  fundCurrency: string
  companies: { investment: { companyName: string; status: string; stage: string | null; totalInvested: number; fmv: number; moic: number | null } }[]
  totals: { totalInvested: number; totalFmv: number; portfolioMoic: number | null }
}, labels: {
  company: string; status: string; stage: string; invested: string; fmv: string; grossMoic: string; total: string
}, locale: string, statusLabel: (status: string) => string): string {
  const rows = preview.companies.map(c => {
    const inv = c.investment
    return `<tr>
      <td>${escHtml(inv.companyName)}</td>
      <td>${escHtml(statusLabel(inv.status))}</td>
      <td>${escHtml(inv.stage ?? '\u2014')}</td>
      <td style="text-align:right">${fmtCurrency(inv.totalInvested, preview.fundCurrency, locale)}</td>
      <td style="text-align:right">${fmtCurrency(inv.fmv, preview.fundCurrency, locale)}</td>
      <td style="text-align:right">${formatMoic(inv.moic, locale)}</td>
    </tr>`
  })

  return `<table>
  <thead>
    <tr>
      <th>${escHtml(labels.company)}</th><th>${escHtml(labels.status)}</th><th>${escHtml(labels.stage)}</th>
      <th style="text-align:right">${escHtml(labels.invested)}</th>
      <th style="text-align:right">${escHtml(labels.fmv)}</th>
      <th style="text-align:right">${escHtml(labels.grossMoic)}</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join('\n    ')}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="3"><strong>${escHtml(labels.total)}</strong></td>
      <td style="text-align:right"><strong>${fmtCurrency(preview.totals.totalInvested, preview.fundCurrency, locale)}</strong></td>
      <td style="text-align:right"><strong>${fmtCurrency(preview.totals.totalFmv, preview.fundCurrency, locale)}</strong></td>
      <td style="text-align:right"><strong>${formatMoic(preview.totals.portfolioMoic, locale)}</strong></td>
    </tr>
  </tfoot>
</table>`
}
