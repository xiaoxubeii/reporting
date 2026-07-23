'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Check, AlertTriangle, Upload, Sparkles, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrency } from '@/components/currency-context'
import { useLedgerFetch } from '@/components/accounting-vehicle'
import { EntryModal } from '../entry-modal'
import { formatDate, formatMoney } from '../format'

interface Txn { id: string; txn_date: string; amount: number; description: string; counterparty: string | null; status: string; suggested_account_code: string | null; journal_entry_id: string | null }
interface Rec { bankEndingBalance: number; ledgerCashBalance: number; difference: number; matchedCount: number; unmatchedCount: number; unmatchedTotal: number; tiesOut: boolean }
interface Candidate { entryId: string; amount: number; entryDate: string; memo: string | null }
interface Lp { lpEntityId: string; name: string; commitment: number }

const actionBtn = 'text-xs border border-input rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors'

export function BankView() {
  const locale = useLocale()
  const t = useTranslations('Funds.bank')
  const currency = useCurrency()
  const fmt = (v: number) => formatMoney(v, currency, locale)
  const [csv, setCsv] = useState('')
  const [txns, setTxns] = useState<Txn[]>([])
  const [rec, setRec] = useState<Rec | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [lps, setLps] = useState<Lp[]>([])
  const [acctNames, setAcctNames] = useState<Record<string, string>>({})
  /** Why a match/book action was refused. Shown rather than swallowed. */
  const [matchError, setMatchError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<{ code: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [categorizing, setCategorizing] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [editing, setEditing] = useState<{ txnId: string; entryId: string; readOnly?: boolean } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bookedLp, setBookedLp] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('date-desc')
  const lf = useLedgerFetch()

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      lf('/api/accounting/bank').then(r => (r.ok ? r.json() : [])),
      lf('/api/accounting/bank/reconcile').then(r => (r.ok ? r.json() : null)),
      lf('/api/accounting/bank/match').then(r => (r.ok ? r.json() : [])),
      lf('/api/accounting/chart').then(r => (r.ok ? r.json() : [])),
      lf('/api/accounting/entities').then(r => (r.ok ? r.json() : [])),
    ]).then(([t, r, c, ch, lpRows]) => {
      setLps(Array.isArray(lpRows) ? lpRows : [])
      setTxns(Array.isArray(t) ? t : [])
      setSelected(new Set())
      setRec(r)
      setCandidates(Array.isArray(c) ? c : [])
      const chart = (Array.isArray(ch) ? ch : []).map((a: any) => ({ code: a.code, name: a.name }))
      setAccounts(chart)
      setAcctNames(Object.fromEntries(chart.map(a => [a.code, a.name])))
    }).finally(() => setLoading(false))
  }, [lf])

  useEffect(() => { load() }, [load])

  async function categorize() {
    setCategorizing(true)
    await lf('/api/accounting/bank/categorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setCategorizing(false)
    load()
  }

  async function match(id: string, mode: 'allocate' | 'link' | 'distribute', entryId?: string, lpEntityId?: string) {
    setMatchError(null)
    const res = await lf('/api/accounting/bank/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, mode, entryId, lpEntityId }) })
    // These can legitimately refuse — a distribution against partners with no capital balance,
    // a closed period, an entry already claimed. The result was being discarded, so a refusal
    // looked exactly like a success that changed nothing.
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setMatchError(body.error || t('bookError'))
      return
    }
    load()
  }

  const candidateFor = (amount: number) => candidates.find(c => Math.abs(c.amount - amount) < 0.01)

  async function doImport() {
    setImporting(true); setResult(null)
    const res = await lf('/api/accounting/bank/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) })
    const data = await res.json()
    if (res.ok) { setResult(data); setCsv(''); load() }
    else setResult({ imported: 0, skipped: 0, errors: [data.error ?? t('importFailed')] })
    setImporting(false)
  }

  async function act(id: string, action: 'post' | 'ignore' | 'unpost' | 'restore') {
    await lf('/api/accounting/bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id }) })
    load()
  }

  const visibleTxns = txns
    .filter(t => (statusFilter ? t.status === statusFilter : true))
    .filter(t => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (t.description ?? '').toLowerCase().includes(q) || (t.counterparty ?? '').toLowerCase().includes(q)
    })
    .slice()
    .sort((a, b) => {
      switch (sortBy) {
        case 'date-asc': return a.txn_date.localeCompare(b.txn_date)
        case 'amount-desc': return Math.abs(b.amount) - Math.abs(a.amount)
        case 'amount-asc': return Math.abs(a.amount) - Math.abs(b.amount)
        default: return b.txn_date.localeCompare(a.txn_date)
      }
    })
  const draftedIds = visibleTxns.filter(t => t.status === 'drafted').map(t => t.id)
  const allDraftedSelected = draftedIds.length > 0 && draftedIds.every(id => selected.has(id))
  const selectedCount = draftedIds.filter(id => selected.has(id)).length
  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAll() {
    setSelected(allDraftedSelected ? new Set<string>() : new Set(draftedIds))
  }
  async function bulkPost() {
    if (selectedCount === 0) return
    await lf('/api/accounting/bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'postMany', ids: draftedIds.filter(id => selected.has(id)) }) })
    load()
  }

  async function setAccount(id: string, code: string) {
    setTxns(prev => prev.map(t => (t.id === id ? { ...t, suggested_account_code: code } : t))) // optimistic
    const res = await lf('/api/accounting/bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setAccount', id, accountCode: code }) })
    if (!res.ok) load() // revert on failure (e.g. custom allocation)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (/\.xlsx?$/i.test(file.name)) {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      setCsv(XLSX.utils.sheet_to_csv(sheet))
    } else {
      setCsv(await file.text())
    }
    e.target.value = ''
  }

  return (
    <div className="space-y-6">
      {matchError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="flex-1">{matchError}</span>
          <button onClick={() => setMatchError(null)} className="text-muted-foreground hover:text-foreground" aria-label={t('dismiss')}>×</button>
        </div>
      )}

      {/* Import */}
      <div className="border rounded-lg p-4 space-y-2">
        <p className="text-sm font-medium">{t('importTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('importHelp')}</p>
        <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={5} placeholder={t('csvPlaceholder')} className="w-full border border-input rounded p-2 text-sm font-mono bg-transparent" />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={doImport} disabled={importing || csv.trim().length < 5}>{importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}{t('import')}</Button>
          <label className="text-xs text-muted-foreground cursor-pointer border rounded px-2 py-1.5 hover:bg-accent">
            {t('upload')}
            <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={onFile} className="hidden" />
          </label>
          {result && (
            <span className="text-sm text-muted-foreground">
              {t('importResult', { imported: result.imported, skipped: result.skipped, errors: result.errors.length })}
            </span>
          )}
        </div>
        {result?.errors?.length ? <p className="text-xs text-red-600">{result.errors[0]}</p> : null}
      </div>

      {/* Reconciliation */}
      {rec && (
        <div className={`rounded-lg border p-3 text-sm flex flex-wrap items-center gap-x-6 gap-y-1 ${rec.tiesOut ? 'border-green-500/40 bg-green-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
          <span className="flex items-center gap-2 font-medium">
            {rec.tiesOut ? <Check className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
            {t('reconciliation')}
          </span>
          <span className="text-muted-foreground">{t('ledgerCash')} <span className="font-mono text-foreground">{fmt(rec.ledgerCashBalance)}</span></span>
          <span className="text-muted-foreground">{t('bankEnding')} <span className="font-mono text-foreground">{fmt(rec.bankEndingBalance)}</span></span>
          <span className="text-muted-foreground">{t('difference')} <span className={`font-mono ${rec.difference !== 0 ? 'text-amber-600' : 'text-foreground'}`}>{fmt(rec.difference)}</span></span>
          {rec.unmatchedCount > 0 && <span className="text-muted-foreground">{t('unmatched', { count: rec.unmatchedCount, total: fmt(rec.unmatchedTotal) })}</span>}
        </div>
      )}

      {/* Transactions */}
      {txns.some(t => t.status === 'drafted') && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={categorize} disabled={categorizing}>
            {categorizing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {t('categorize')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('categorizeHelp')}</span>
          {selectedCount > 0 && <Button size="sm" onClick={bulkPost}>{t('postSelected', { count: selectedCount })}</Button>}
        </div>
      )}
      {loading && txns.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</div>
      ) : txns.length === 0 ? (
        <div className="border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">{t('empty')}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t('searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 w-64" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
              <option value="">{t('allStatuses')}</option>
              <option value="drafted">{t('notPosted')}</option>
              <option value="reconciled">{t('posted')}</option>
              <option value="ignored">{t('ignored')}</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="h-9 px-3 rounded-md border border-input bg-background text-sm">
              <option value="date-desc">{t('sort.dateDesc')}</option>
              <option value="date-asc">{t('sort.dateAsc')}</option>
              <option value="amount-desc">{t('sort.amountDesc')}</option>
              <option value="amount-asc">{t('sort.amountAsc')}</option>
            </select>
            <span className="text-xs text-muted-foreground">{t('visibleCount', { visible: visibleTxns.length, total: txns.length })}</span>
          </div>
          {visibleTxns.length === 0 ? (
            <div className="border border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">{t('noMatches')}</div>
          ) : (
          <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium">{t('date')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('description')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('amount')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('suggested')}</th>
                <th className="px-3 py-2 font-medium" />
                <th className="px-2 py-2 w-8 text-center">{draftedIds.length > 0 && <input type="checkbox" aria-label={t('selectAllDrafted')} checked={allDraftedSelected} onChange={toggleAll} />}</th>
              </tr>
            </thead>
            <tbody>
              {visibleTxns.map(txn => (
                <tr key={txn.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{formatDate(txn.txn_date, locale)}</td>
                  <td className="px-3 py-2">{txn.description}</td>
                  <td className={`px-3 py-2 text-right font-mono ${txn.amount < 0 ? 'text-muted-foreground' : ''}`}>{fmt(txn.amount)}</td>
                  <td className="px-3 py-2 text-xs">
                    {txn.status === 'drafted' ? (
                      <select
                        value={txn.suggested_account_code ?? ''}
                        onChange={e => setAccount(txn.id, e.target.value)}
                        className="border border-input rounded bg-transparent px-1.5 py-1 text-xs max-w-[220px] hover:bg-accent/50"
                      >
                        {!txn.suggested_account_code && <option value="">—</option>}
                        {accounts.map(a => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
                      </select>
                    ) : txn.suggested_account_code ? (
                      <span>
                        <span className="text-foreground">{acctNames[txn.suggested_account_code] ?? txn.suggested_account_code}</span>
                        {acctNames[txn.suggested_account_code] && <span className="ml-1.5 text-muted-foreground/70 font-mono">{txn.suggested_account_code}</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {txn.status === 'drafted' && (
                      <span className="flex items-center gap-1.5 justify-end">
                        {txn.amount > 0 && (candidateFor(txn.amount)
                          ? <button onClick={() => match(txn.id, 'link', candidateFor(txn.amount)!.entryId)} className={actionBtn} title={t('matchCallHelp')}>{t('matchCall')}</button>
                          : lps.length > 0
                            ? <select
                                value={bookedLp[txn.id] ?? ''}
                                onChange={e => { const v = e.target.value; if (!v) return; setBookedLp(m => ({ ...m, [txn.id]: v })); if (v === '__prorata__') match(txn.id, 'allocate'); else match(txn.id, 'allocate', undefined, v) }}
                                title={t('bookCallHelp')}
                                className="text-xs border border-input rounded bg-transparent px-2 py-1 max-w-[170px] text-muted-foreground hover:bg-accent"
                              >
                                <option value="">{t('bookAsCall')}</option>
                                {lps.map(l => <option key={l.lpEntityId} value={l.lpEntityId}>{l.name}</option>)}
                                <option value="__prorata__">{t('allLpsProrata')}</option>
                              </select>
                            : <button onClick={() => match(txn.id, 'allocate')} className={actionBtn} title={t('allocateCallHelp')}>{t('bookAsCall')}</button>
                        )}

                        {/* The outflow counterpart. Without it, the only way to book a
                            distribution was the bank categorizer's rule, which posts to the
                            POOLED capital account with no partner attached — money leaves the
                            fund and no LP's capital account or statement ever records it. */}
                        {txn.amount < 0 && (
                          <button
                            onClick={() => match(txn.id, 'distribute')}
                            className={actionBtn}
                            title={t('distributionHelp')}
                          >
                            {t('bookDistribution')}
                          </button>
                        )}
                        {txn.journal_entry_id && <button onClick={() => setEditing({ txnId: txn.id, entryId: txn.journal_entry_id! })} className={actionBtn}>{t('edit')}</button>}
                        <button onClick={() => act(txn.id, 'post')} className={actionBtn}>{t('post')}</button>
                        <button onClick={() => act(txn.id, 'ignore')} className={actionBtn}>{t('ignore')}</button>
                      </span>
                    )}
                    {txn.status === 'reconciled' && (
                      <span className="flex justify-end">
                        {txn.journal_entry_id
                          ? <button onClick={() => setEditing({ txnId: txn.id, entryId: txn.journal_entry_id!, readOnly: true })} title={t('viewEditHelp')} className={actionBtn}>{t('viewEdit')}</button>
                          : <button onClick={() => act(txn.id, 'unpost')} title={t('unpostHelp')} className={actionBtn}>{t('unpost')}</button>}
                      </span>
                    )}
                    {txn.status === 'ignored' && (
                      <span className="flex items-center gap-1.5 justify-end">
                        <span className="text-xs text-muted-foreground italic">{t('ignored')}</span>
                        <button onClick={() => act(txn.id, 'restore')} title={t('restoreHelp')} className={actionBtn}>{t('restore')}</button>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">{txn.status === 'drafted' && <input type="checkbox" checked={selected.has(txn.id)} onChange={() => toggleRow(txn.id)} aria-label={t('selectTransaction')} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          )}
        </>
      )}

      {editing && <EntryModal txnId={editing.txnId} entryId={editing.entryId} readOnly={editing.readOnly} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  )
}
