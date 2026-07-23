'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useConfirm } from '@/components/confirm-dialog'

export function ReprocessButton({ emailId }: { emailId: string }) {
  const t = useTranslations('Emails.detail')
  const router = useRouter()
  const confirm = useConfirm()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleClick() {
    const ok = await confirm({
      title: t('reprocess.title'),
      description: t('reprocess.description'),
      confirmLabel: t('reprocess.confirm'),
      variant: 'destructive',
    })
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch(`/api/emails/${emailId}/reprocess`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to reprocess')
      }
      setDone(true)
      // Refresh page after a short delay to show updated status
      setTimeout(() => router.refresh(), 1500)
    } catch {
      toast.error(t('errors.reprocess'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={loading || done}
      className="gap-1.5 shrink-0"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      {done ? t('reprocess.processing') : t('reprocess.action')}
    </Button>
  )
}
