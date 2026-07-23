'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

const STATUSES = [
  { value: 'success', key: 'success' },
  { value: 'needs_review', key: 'review' },
  { value: 'not_processed', key: 'skipped' },
  { value: 'failed', key: 'failed' },
] as const

export function ChangeStatusButton({ emailId, currentStatus }: { emailId: string; currentStatus: string }) {
  const t = useTranslations('Emails')
  const router = useRouter()
  const [selected, setSelected] = useState(currentStatus)
  const [saving, setSaving] = useState(false)

  const hasChanged = selected !== currentStatus

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/emails/${emailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processing_status: selected }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update status')
      }
      router.refresh()
    } catch {
      toast.error(t('detail.errors.status'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map(s => (
            <SelectItem key={s.value} value={s.value}>{t(`statuses.${s.key}`)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasChanged && (
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="h-8"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('detail.actions.save')}
        </Button>
      )}
    </div>
  )
}
