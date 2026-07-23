'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Upload, Mail, Eye } from 'lucide-react'
import { LpAuthorizedUsers } from '@/components/lp-authorized-users'

interface Investor { id: string; name: string }
interface ParsedRow { name: string; email: string; authorized_emails: string[] }
interface Summary {
  rows: number; matched: number; toCreate: string[]; lpInvites: number; authorizedInvites: number
  errors: { row: number; message: string }[]; committed: boolean
}

/** Parse pasted Excel (tab) or CSV (comma) into rows. Detects a header row;
 *  falls back to positional name,email,authorized… when no header is found. */
function parsePaste(text: string): { rows: ParsedRow[]; delimiter: 'tab' | 'comma' | null } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { rows: [], delimiter: null }
  const delim = lines.some(l => l.includes('\t')) ? '\t' : ','
  const cells = (l: string) => l.split(delim).map(c => c.trim().replace(/^"|"$/g, ''))
  const header = cells(lines[0]).map(h => h.toLowerCase())
  let nameIdx = header.findIndex(h => /name|investor|\blp\b/.test(h))
  let emailIdx = header.findIndex(h => /e-?mail/.test(h) && !/authorized|advisor|rep/.test(h))
  const authIdxs = header.map((h, i) => (/authorized|advisor|rep/.test(h) ? i : -1)).filter(i => i >= 0)
  let start = 1
  if (nameIdx < 0 || emailIdx < 0) { nameIdx = 0; emailIdx = 1; start = 0 } // positional fallback
  const rows: ParsedRow[] = []
  for (let i = start; i < lines.length; i++) {
    const c = cells(lines[i])
    const name = (c[nameIdx] ?? '').trim()
    const email = (c[emailIdx] ?? '').trim()
    if (!name && !email) continue
    const authorized_emails = (authIdxs.length ? authIdxs.map(ai => c[ai] ?? '') : c.slice(emailIdx + 1))
      .flatMap(v => v.split(/[;\s]+/)).map(s => s.trim()).filter(s => s.includes('@'))
    rows.push({ name, email, authorized_emails })
  }
  return { rows, delimiter: delim === '\t' ? 'tab' : 'comma' }
}

export function LpAccessSettings() {
  const t = useTranslations('LPs.admin.access')
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null)
  const [preview, setPreview] = useState<Summary | null>(null)
  const [result, setResult] = useState<Summary | null>(null)
  const [parseNote, setParseNote] = useState('')
  const [busy, setBusy] = useState(false)

  const [investors, setInvestors] = useState<Investor[]>([])
  const [singleInvestor, setSingleInvestor] = useState('')
  const [singleEmail, setSingleEmail] = useState('')
  const [singleMsg, setSingleMsg] = useState<string | null>(null)
  const [singleBusy, setSingleBusy] = useState(false)

  useEffect(() => {
    fetch('/api/lps/investors')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setInvestors((Array.isArray(d) ? d : []).map((investor: Investor) => ({ id: investor.id, name: investor.name }))))
      .catch(() => {})
  }, [])

  async function doPreview() {
    const { rows, delimiter } = parsePaste(text)
    setParsed(rows); setParseNote(delimiter ? t('detected', { delimiter: t(`delimiters.${delimiter}`), count: rows.length }) : ''); setResult(null)
    if (rows.length === 0) { setPreview(null); return }
    setBusy(true)
    const res = await fetch('/api/lps/invites/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows, commit: false }),
    })
    setPreview(res.ok ? await res.json() : null)
    setBusy(false)
  }

  async function doCommit() {
    if (!parsed) return
    setBusy(true)
    const res = await fetch('/api/lps/invites/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: parsed, commit: true }),
    })
    setResult(res.ok ? await res.json() : null)
    setPreview(null); setBusy(false)
    if (res.ok) { setText(''); setParsed(null) }
  }

  async function singleInvite() {
    if (!singleInvestor || !singleEmail.trim()) return
    setSingleBusy(true); setSingleMsg(null)
    const res = await fetch('/api/lps/invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lp_investor_id: singleInvestor, email: singleEmail.trim() }),
    })
    setSingleMsg(res.ok ? t('invited', { email: singleEmail.trim() }) : t('inviteFailed'))
    setSingleBusy(false)
    if (res.ok) setSingleEmail('')
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="outline" size="sm" className="text-muted-foreground">
        <a href="/lps/preview"><Eye className="h-4 w-4 mr-1.5" /> {t('previewPortal')}</a>
      </Button>

      {/* Bulk */}
      <div>
        <h4 className="text-sm font-medium mb-1">{t('bulkTitle')}</h4>
        <p className="text-xs text-muted-foreground mb-2">
          {t('bulkDescription')}
        </p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={6}
          placeholder={t('sample')}
          className="w-full rounded-md border border-input bg-transparent p-2 text-xs font-mono"
        />
        <div className="flex items-center gap-2 mt-2">
          <Button size="sm" variant="outline" onClick={doPreview} disabled={busy || !text.trim()}>
            {busy && !preview ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}{t('preview')}
          </Button>
          {parseNote && <span className="text-[11px] text-muted-foreground">{parseNote}</span>}
        </div>

        {preview && (
          <div className="mt-3 rounded-md border bg-muted/20 p-3 text-xs space-y-1">
            <div>{t('previewInvites', { lp: preview.lpInvites, authorized: preview.authorizedInvites })}</div>
            <div>
              {t('previewMatched', {
                matched: preview.matched,
                created: preview.toCreate.length,
                names: preview.toCreate.slice(0, 8).join(', '),
                suffix: preview.toCreate.length > 8 ? '…' : '',
              })}
            </div>
            {preview.errors.length > 0 && (
              <div className="text-amber-600 dark:text-amber-400">
                {t('rowsSkipped', { count: preview.errors.length, details: preview.errors.slice(0, 5).map(e => `${e.row} (${e.message})`).join('; '), suffix: preview.errors.length > 5 ? '…' : '' })}
              </div>
            )}
            <Button size="sm" className="mt-2" onClick={doCommit} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              {t('sendInvites', { count: preview.lpInvites + preview.authorizedInvites })}
            </Button>
          </div>
        )}
        {result && (
          <div className="mt-3 rounded-md border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300">
            {t('result', { lp: result.lpInvites, authorized: result.authorizedInvites, created: result.toCreate.length, skipped: result.errors.length })}
          </div>
        )}
      </div>

      {/* Single */}
      <div>
        <h4 className="text-sm font-medium mb-1">{t('singleTitle')}</h4>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={singleInvestor} onChange={e => setSingleInvestor(e.target.value)} className="h-8 w-full sm:w-auto sm:max-w-[280px] truncate rounded-md border border-input bg-background px-2 text-sm">
            <option value="">{t('selectInvestor')}</option>
            {investors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <Input value={singleEmail} onChange={e => setSingleEmail(e.target.value)} placeholder={t('emailPlaceholder')} className="h-8 text-sm flex-1 min-w-[180px]" />
          <Button size="sm" onClick={singleInvite} disabled={singleBusy || !singleInvestor || !singleEmail.trim()}>
            {singleBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1" />}{t('invite')}
          </Button>
          {singleMsg && <span className="text-xs text-muted-foreground">{singleMsg}</span>}
        </div>
      </div>

      {/* Authorized users */}
      <div>
        <h4 className="text-sm font-medium mb-2">{t('authorizedUsers')}</h4>
        <LpAuthorizedUsers />
      </div>
    </div>
  )
}
