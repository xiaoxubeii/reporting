'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, Upload, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useConfirm } from '@/components/confirm-dialog'
import { createClient } from '@/lib/supabase/client'

type Confidence = 'unavailable' | 'preliminary' | 'reliable' | 'robust'

export interface AnchorListItem {
  id: string
  file_name: string
  file_format: string
  file_size_bytes: number | null
  title: string | null
  vintage_year: number | null
  vintage_quarter: string | null
  sector: string | null
  voice_representativeness: 'exemplary' | 'representative' | 'atypical' | 'do_not_match_voice'
  partner_notes: string | null
  extracted_at: string | null
  extracted_text_length?: number
  uploaded_at: string
}

const VOICE_BADGE: Record<AnchorListItem['voice_representativeness'], string> = {
  exemplary: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  representative: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  atypical: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  do_not_match_voice: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

const CONFIDENCE_CLASSES: Record<Confidence, string> = {
  unavailable: 'bg-gray-100 text-gray-700',
  preliminary: 'bg-amber-100 text-amber-800',
  reliable: 'bg-blue-100 text-blue-800',
  robust: 'bg-emerald-100 text-emerald-800',
}

function nextConfidence(count: number): Confidence {
  if (count <= 0) return 'unavailable'
  if (count <= 2) return 'preliminary'
  if (count <= 7) return 'reliable'
  return 'robust'
}

export function StyleAnchorsLibrary({ initialAnchors, initialConfidence, embedded }: {
  initialAnchors: AnchorListItem[]
  initialConfidence: Confidence
  embedded?: boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const locale = useLocale()
  const t = useTranslations('Settings.styleAnchors')
  const [anchors, setAnchors] = useState(initialAnchors)
  const [uploadOpen, setUploadOpen] = useState(false)

  const confidence = anchors.length === initialAnchors.length ? initialConfidence : nextConfidence(anchors.length)

  async function remove(id: string) {
    const ok = await confirm({
      title: t('deleteTitle'),
      description: t('deleteDescription'),
      confirmLabel: t('delete'),
      variant: 'destructive',
    })
    if (!ok) return
    setAnchors(prev => prev.filter(a => a.id !== id))
    await fetch(`/api/firm/style-anchors/${id}`, { method: 'DELETE' })
  }

  function handleUploaded(row: AnchorListItem) {
    setAnchors(prev => [row, ...prev])
    setUploadOpen(false)
    router.refresh()
  }

  return (
    <div className={embedded ? '' : 'p-4 md:py-8 md:pl-8 md:pr-4 max-w-5xl'}>
      {!embedded && (
        <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> {t('back')}
        </Link>
      )}

      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          {!embedded && <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>}
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {t('description')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5 mr-1" /> {t('uploadMemo')}
        </Button>
      </div>

      <div className={`mb-6 rounded-md border p-3 text-sm dark:bg-opacity-20 ${CONFIDENCE_CLASSES[confidence]}`}>
        <div className="font-medium">{t(`confidence.${confidence}.label`)}</div>
        <div className="opacity-80 mt-0.5 text-[13px]">{t(`confidence.${confidence}.help`)}</div>
      </div>

      {anchors.length === 0 ? (
        <div className="rounded-md border bg-card p-12 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {anchors.map(a => (
            <div key={a.id} className="rounded-md border bg-card p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2">
                <Link href={`/settings/memo-agent/style-anchors/${a.id}`} className="font-medium truncate hover:underline">
                  {a.title || a.file_name}
                </Link>
                <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium ${VOICE_BADGE[a.voice_representativeness]}`}>
                  {t(`voice.${a.voice_representativeness}`)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5 flex-1">
                <div>
                  {a.vintage_year ? `${new Intl.NumberFormat(locale, { useGrouping: false }).format(a.vintage_year)}${a.vintage_quarter ? ` ${a.vintage_quarter}` : ''}` : t('noVintage')}
                  {a.sector && ` · ${a.sector}`}
                </div>
                <div>{a.file_format.toUpperCase()} · {a.file_size_bytes ? t('sizeMb', { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(a.file_size_bytes / 1024 / 1024) }) : '—'}</div>
                <div>
                  {a.extracted_at ? (
                    <span>{t('textExtracted', { count: a.extracted_text_length ?? 0 })}</span>
                  ) : (
                    <span className="text-amber-600">{t('extractionFailed')}</span>
                  )}
                </div>
                {a.partner_notes && (
                  <div className="italic mt-1 line-clamp-2">&ldquo;{a.partner_notes}&rdquo;</div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-3 pt-2 border-t">
                <Link
                  href={`/settings/memo-agent/style-anchors/${a.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('editMetadata')}
                </Link>
                <button onClick={() => remove(a.id)} aria-label={t('deleteMemo', { name: a.title || a.file_name })} className="ml-auto text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={handleUploaded} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upload dialog
// ---------------------------------------------------------------------------

function UploadDialog({ open, onOpenChange, onUploaded }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onUploaded: (row: AnchorListItem) => void
}) {
  const locale = useLocale()
  const t = useTranslations('Settings.styleAnchors')
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [vintageYear, setVintageYear] = useState('')
  const [sector, setSector] = useState('')
  const [voice, setVoice] = useState('representative')
  const [partnerNotes, setPartnerNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!file) return
    setSubmitting(true)
    setError(null)
    try {
      // Two-step upload to bypass Vercel's ~4.5 MB serverless body limit.
      // Step 1: get a signed upload URL from the server. The server picks the
      // storage path (scoped to the fund) and validates the file extension.
      const urlRes = await fetch('/api/firm/style-anchors/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: file.name }),
      })
      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}))
        throw new Error(body.error ?? t('prepareUploadFailed'))
      }
      const { storage_path, token } = await urlRes.json() as { storage_path: string; token: string }

      // Step 2: upload directly to Supabase Storage using the signed URL.
      // The bytes never touch Vercel, so the 4.5 MB body limit doesn't apply.
      const supabase = createClient()
      const { error: upErr } = await supabase.storage
        .from('style-anchor-memos')
        .uploadToSignedUrl(storage_path, token, file, { contentType: file.type || 'application/octet-stream' })
      if (upErr) throw new Error(t('uploadFailedWithDetail', { detail: upErr.message }))

      // Step 3: finalize — record the metadata row and trigger text extraction.
      // Only the storage path + JSON metadata travel through Vercel here.
      const finalRes = await fetch('/api/firm/style-anchors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_path,
          file_name: file.name,
          title: title.trim() || undefined,
          vintage_year: vintageYear.trim() || undefined,
          sector: sector.trim() || undefined,
          voice_representativeness: voice,
          partner_notes: partnerNotes.trim() || undefined,
        }),
      })
      if (!finalRes.ok) {
        const body = await finalRes.json().catch(() => ({}))
        throw new Error(body.error ?? t('uploadFailed'))
      }
      const row: AnchorListItem = await finalRes.json()
      onUploaded(row)
      // Reset form
      setFile(null); setTitle(''); setVintageYear(''); setSector(''); setVoice('representative'); setPartnerNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('uploadFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('uploadDialog.title')}</DialogTitle>
          <DialogDescription>{t('uploadDialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t('uploadDialog.file')}</label>
            <label className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border bg-card text-sm hover:bg-muted/50 cursor-pointer ${submitting ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload className="h-3.5 w-3.5" />
              {file ? t('uploadDialog.chooseDifferent') : t('uploadDialog.chooseFile')}
              <input
                type="file"
                accept=".pdf,.docx,.md,.txt,application/pdf"
                className="hidden"
                disabled={submitting}
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && <p className="text-[11px] text-muted-foreground mt-1">{file.name} · {t('sizeMb', { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(file.size / 1024 / 1024) })}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('uploadDialog.memoTitle')}</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('uploadDialog.titlePlaceholder')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('uploadDialog.vintageYear')}</label>
              <Input value={vintageYear} onChange={e => setVintageYear(e.target.value)} placeholder={t('uploadDialog.yearPlaceholder')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('uploadDialog.sector')}</label>
              <Input value={sector} onChange={e => setSector(e.target.value)} placeholder={t('uploadDialog.sectorPlaceholder')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('uploadDialog.voiceFit')}</label>
              <select value={voice} onChange={e => setVoice(e.target.value)} className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm">
                <option value="exemplary">{t('voice.exemplary')}</option>
                <option value="representative">{t('voice.representative')}</option>
                <option value="atypical">{t('voice.atypical')}</option>
                <option value="do_not_match_voice">{t('uploadDialog.doNotMatch')}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t('uploadDialog.partnerNotes')}</label>
            <textarea
              value={partnerNotes}
              onChange={e => setPartnerNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t('uploadDialog.notesPlaceholder')}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t('cancel')}</Button>
          <Button onClick={submit} disabled={submitting || !file}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
