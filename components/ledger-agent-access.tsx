'use client'

import { useEffect, useState } from 'react'
import { Loader2, Copy, Check, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { AGENT_TOOL_MANIFEST } from '@/lib/accounting/agent-tools-manifest'
import { PORTFOLIO_TOOL_MANIFEST } from '@/lib/agent/portfolio-tools-manifest'
import { DILIGENCE_TOOL_MANIFEST } from '@/lib/agent/diligence-tools-manifest'
import { DEALS_TOOL_MANIFEST } from '@/lib/agent/deals-tools-manifest'
import { LP_TOOL_MANIFEST } from '@/lib/agent/lp-tools-manifest'

// One surface, one key, the whole firm — deal flow at the top of the funnel, the deals
// under diligence, what the fund ended up owning, what the LPs hold, and what the books
// say. Grouped so the list reads as capability rather than a flat wall of names, and
// ordered the way the money actually travels.
const TOOL_COUNT = DEALS_TOOL_MANIFEST.length
  + DILIGENCE_TOOL_MANIFEST.length
  + PORTFOLIO_TOOL_MANIFEST.length
  + LP_TOOL_MANIFEST.length
  + AGENT_TOOL_MANIFEST.length

interface Key { id: string; name: string; key_prefix: string; scopes: string; last_used_at: string | null; revoked_at: string | null; created_at: string }

/**
 * Agent access: the caller's own API keys plus the MCP/REST endpoints an agent connects
 * to. Keys act as their owner — any member's key can read; only an admin's key can
 * write. Non-admins can mint read-only keys only.
 */
export function LedgerAgentAccess({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('Settings.ledgerAgent')
  const [keys, setKeys] = useState<Key[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [readOnly, setReadOnly] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [mcpUrl, setMcpUrl] = useState('')
  const [restUrl, setRestUrl] = useState('')
  const [showTools, setShowTools] = useState(false)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [savingEnabled, setSavingEnabled] = useState(false)

  useEffect(() => {
    // The canonical addresses. Both surfaces long outgrew the "accounting" name —
    // they serve the whole portfolio too — so neither is under /api/accounting any
    // more. The legacy /api/accounting/mcp still works for keys and configs already
    // pointed at it; the REST endpoint moved outright, since nothing used it yet.
    setMcpUrl(`${window.location.origin}/api/mcp`)
    setRestUrl(`${window.location.origin}/api/agent`)

    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(s => setEnabled(!!s?.agentApiEnabled))
      .catch(() => setEnabled(false))

    load()
  }, [])

  async function setAgentApi(next: boolean) {
    setSavingEnabled(true)
    setEnabled(next) // optimistic
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentApiEnabled: next }),
    })
    if (!res.ok) setEnabled(!next) // roll back rather than lie about the state
    else if (next) load()
    setSavingEnabled(false)
  }

  function load() {
    setLoading(true)
    fetch('/api/accounting/keys').then(r => (r.ok ? r.json() : [])).then(d => setKeys(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }

  async function create() {
    if (!name.trim()) return
    setCreating(true); setNewToken(null)
    const res = await fetch('/api/accounting/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, readOnly }) })
    const data = await res.json()
    if (res.ok) { setNewToken(data.token); setName(''); load() }
    setCreating(false)
  }

  async function revoke(id: string) {
    await fetch(`/api/accounting/keys?id=${id}`, { method: 'DELETE' })
    load()
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 1500)
  }

  const active = keys.filter(k => !k.revoked_at)
  const toolGroups = [
    { label: t('toolGroups.deals'), tools: DEALS_TOOL_MANIFEST },
    { label: t('toolGroups.diligence'), tools: DILIGENCE_TOOL_MANIFEST },
    { label: t('toolGroups.portfolio'), tools: PORTFOLIO_TOOL_MANIFEST },
    { label: t('toolGroups.lp'), tools: LP_TOOL_MANIFEST },
    { label: t('toolGroups.ledger'), tools: AGENT_TOOL_MANIFEST },
  ]
  const toolDescriptions: Record<string, string> = {
    deals_list_inbound: t('toolDescriptions.deals_list_inbound'),
    deals_inbound_detail: t('toolDescriptions.deals_inbound_detail'),
    diligence_list_deals: t('toolDescriptions.diligence_list_deals'),
    diligence_deal_detail: t('toolDescriptions.diligence_deal_detail'),
    diligence_ask: t('toolDescriptions.diligence_ask'),
    diligence_checklist: t('toolDescriptions.diligence_checklist'),
    diligence_list_documents: t('toolDescriptions.diligence_list_documents'),
    diligence_evidence: t('toolDescriptions.diligence_evidence'),
    diligence_memo: t('toolDescriptions.diligence_memo'),
    list_vehicles: t('toolDescriptions.list_vehicles'),
    list_companies: t('toolDescriptions.list_companies'),
    company_detail: t('toolDescriptions.company_detail'),
    list_investments: t('toolDescriptions.list_investments'),
    portfolio_summary: t('toolDescriptions.portfolio_summary'),
    fund_performance: t('toolDescriptions.fund_performance'),
    company_metrics: t('toolDescriptions.company_metrics'),
    list_lps: t('toolDescriptions.list_lps'),
    record_investment: t('toolDescriptions.record_investment'),
    lp_list_snapshots: t('toolDescriptions.lp_list_snapshots'),
    lp_snapshot: t('toolDescriptions.lp_snapshot'),
    lp_live_report: t('toolDescriptions.lp_live_report'),
    lp_reconcile_snapshot: t('toolDescriptions.lp_reconcile_snapshot'),
    lp_capital_summary: t('toolDescriptions.lp_capital_summary'),
    lp_statement: t('toolDescriptions.lp_statement'),
    lp_capital_calls: t('toolDescriptions.lp_capital_calls'),
    lp_list_investors: t('toolDescriptions.lp_list_investors'),
    list_accounts: t('toolDescriptions.list_accounts'),
    seed_chart: t('toolDescriptions.seed_chart'),
    list_entities: t('toolDescriptions.list_entities'),
    capital_accounts: t('toolDescriptions.capital_accounts'),
    financial_statements: t('toolDescriptions.financial_statements'),
    list_journal: t('toolDescriptions.list_journal'),
    post_entry: t('toolDescriptions.post_entry'),
    allocation: t('toolDescriptions.allocation'),
    list_periods: t('toolDescriptions.list_periods'),
    close_period: t('toolDescriptions.close_period'),
    export_ledger_text: t('toolDescriptions.export_ledger_text'),
    post_ledger_text: t('toolDescriptions.post_ledger_text'),
    reconcile: t('toolDescriptions.reconcile'),
    import_bank_transactions: t('toolDescriptions.import_bank_transactions'),
    categorize_bank_transactions: t('toolDescriptions.categorize_bank_transactions'),
    book_capital_call: t('toolDescriptions.book_capital_call'),
    list_bank_transactions: t('toolDescriptions.list_bank_transactions'),
    bank_reconciliation: t('toolDescriptions.bank_reconciliation'),
    run_waterfall: t('toolDescriptions.run_waterfall'),
  }

  function localizedScopes(scopes: string): string {
    return scopes.split(',').map(scope => scope.trim() === 'write' ? t('scopes.write') : t('scopes.read')).join(', ')
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {isAdmin ? t('introAdmin') : t('introMember')}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {t.rich('draftNotice', { strong: chunks => <strong>{chunks}</strong> })}
      </p>

      {/* The master switch. Everything below is dead until this is on, so it comes
          first — and non-admins are told who can turn it on rather than being shown
          a control they can't use. */}
      {isAdmin ? (
        <label className="flex items-start gap-2 text-sm cursor-pointer rounded-md border p-3">
          <input
            type="checkbox"
            checked={!!enabled}
            onChange={e => setAgentApi(e.target.checked)}
            disabled={savingEnabled || enabled === null}
            className="mt-1 h-3.5 w-3.5"
          />
          <span>
            {t('enableLabel')}
            <span className="block text-xs text-muted-foreground">
              {t('enableDescription')}
            </span>
          </span>
          {savingEnabled && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
        </label>
      ) : enabled === false ? (
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t('disabledNotice')}
        </div>
      ) : null}

      {enabled && (
      <>
      {/* Endpoints */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-12 shrink-0 text-xs">MCP</span>
          <code className="flex-1 bg-muted rounded px-2 py-1 text-xs font-mono truncate">{mcpUrl || '…'}</code>
          <button onClick={() => copy(mcpUrl, 'mcp')} className="text-muted-foreground hover:text-foreground" aria-label={t('copyMcp')}>{copied === 'mcp' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-12 shrink-0 text-xs">REST</span>
          <code className="flex-1 bg-muted rounded px-2 py-1 text-xs font-mono truncate">{restUrl || '…'}</code>
          <button onClick={() => copy(restUrl, 'rest')} className="text-muted-foreground hover:text-foreground" aria-label={t('copyRest')}>{copied === 'rest' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}</button>
        </div>
      </div>

      {/* How to actually connect. This was the missing piece: people pasted the MCP
          URL into Claude's connector, hit the OAuth wall, and had nothing to go on. */}
      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
        <p className="text-xs font-medium">{t('connectingTitle')}</p>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc ml-4">
          <li>
            {t.rich('desktopInstructions', { strong: chunks => <strong>{chunks}</strong> })}
          </li>
          <li>
            {t.rich('cliInstructions', { strong: chunks => <strong>{chunks}</strong> })}
            <code className="block bg-background rounded px-2 py-1 mt-1 font-mono text-[11px] whitespace-pre-wrap break-all">
              claude mcp add --transport http fund {mcpUrl} --header &quot;Authorization: Bearer YOUR_KEY&quot;
            </code>
          </li>
        </ul>
      </div>

      {newToken && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="text-amber-700 dark:text-amber-400 mb-1">{t('tokenWarning')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-background rounded px-2 py-1 text-xs font-mono truncate">{newToken}</code>
            <button onClick={() => copy(newToken, 'token')} className="text-muted-foreground hover:text-foreground" aria-label={t('copyToken')}>{copied === 'token' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('keyNamePlaceholder')} aria-label={t('keyNameLabel')} className="border rounded px-2 py-1.5 text-sm flex-1 bg-transparent" />
        {isAdmin && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={readOnly} onChange={e => setReadOnly(e.target.checked)} />{t('readOnly')}</label>
        )}
        <Button size="sm" onClick={create} disabled={creating || !name.trim()}>{creating && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}{t('createKey')}</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('keyHelp')}</p>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noKeys')}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {active.map(k => (
              <tr key={k.id} className="border-t">
                <td className="py-1.5">{k.name}</td>
                <td className="py-1.5 font-mono text-xs text-muted-foreground">{k.key_prefix}…</td>
                <td className="py-1.5 text-xs text-muted-foreground">{localizedScopes(k.scopes)}</td>
                <td className="py-1.5 text-xs text-muted-foreground">{k.last_used_at ? t('used') : t('unused')}</td>
                <td className="py-1.5 text-right"><button onClick={() => revoke(k.id)} className="text-muted-foreground hover:text-red-600" title={t('revoke')} aria-label={t('revoke')}><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button onClick={() => setShowTools(v => !v)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
        {showTools ? t('toolsHide', { count: TOOL_COUNT }) : t('toolsShow', { count: TOOL_COUNT })}
      </button>
      {showTools && (
        <div className="space-y-4">
          {toolGroups.map(g => (
            <div key={g.label} className="space-y-1.5">
              <p className="text-xs font-medium">{g.label} <span className="text-muted-foreground font-normal">{t('toolGroupCount', { count: g.tools.length })}</span></p>
              {g.tools.map(tool => (
                <div key={tool.name} className="text-sm flex gap-2">
                  <code className="text-xs bg-muted rounded px-1.5 py-0.5 font-mono shrink-0">{tool.name}</code>
                  <span className={`text-[10px] uppercase tracking-wider px-1 py-0.5 rounded self-center shrink-0 ${tool.scope === 'write' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>{tool.scope === 'write' ? t('scopes.write') : t('scopes.read')}</span>
                  <span className="text-muted-foreground text-xs self-center">{toolDescriptions[tool.name]}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}
