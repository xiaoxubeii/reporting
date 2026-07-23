'use client'

// Shared LP rename dialog — used on /lps (has an investorId) and from accounting pages
// (which only have an entityId). Error-first: a name collision is reported as an error,
// not silently merged. Merging is an explicit, double-confirmed action the user opts into.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export function RenameInvestorDialog({ target, onClose, onSaved }: {
  target: { investorId?: string; entityId?: string; name: string }
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('LPs.admin.rename')
  const [name, setName] = useState(target.name)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ conflictId: string; sourceId: string } | null>(null)
  const [confirmMerge, setConfirmMerge] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true); setErr(null)
    const body: Record<string, string> = { name: name.trim() }
    if (target.investorId) body.id = target.investorId
    else if (target.entityId) body.entityId = target.entityId

    const res = await fetch('/api/lps/investors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)

    if (res.ok) { onSaved(); return }

    const d = await res.json().catch(() => ({}))
    if (d.error === 'duplicate_name' && d.conflictId && d.sourceId) {
      setConflict({ conflictId: d.conflictId, sourceId: d.sourceId })
      return
    }
    setErr(d.error === 'duplicate_name' ? t('duplicate') : (d.error ?? t('error')))
  }

  async function merge() {
    if (!conflict) return
    setSaving(true); setErr(null)
    const res = await fetch('/api/lps/investors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: conflict.sourceId, targetId: conflict.conflictId }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? t('mergeError')); return }
    onSaved()
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{t('title')}</DialogTitle></DialogHeader>

        <Input
          value={name}
          onChange={e => { setName(e.target.value); setConflict(null); setConfirmMerge(false); setErr(null) }}
          onKeyDown={e => e.key === 'Enter' && !conflict && save()}
          autoFocus
          disabled={saving}
        />

        {err && <p className="text-xs text-destructive">{err}</p>}

        {conflict && !confirmMerge && (
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">
              {t('conflict', { name: name.trim() })}
            </p>
            <Button variant="outline" size="sm" onClick={() => setConfirmMerge(true)} disabled={saving}>
              {t('mergeInstead')}
            </Button>
          </div>
        )}

        {conflict && confirmMerge && (
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">
              {t('confirmDescription', { name: name.trim() })}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmMerge(false)} disabled={saving}>{t('back')}</Button>
              <Button variant="destructive" size="sm" onClick={merge} disabled={saving}>
                {saving ? t('merging') : t('confirmMerge')}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('cancel')}</Button>
          {!conflict && (
            <Button onClick={save} disabled={saving || !name.trim()}>{saving ? t('saving') : t('save')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
