'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ArrowRightLeft } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfirm } from '@/components/confirm-dialog'

const TARGETS = [
  { value: 'reporting', key: 'reporting' },
  { value: 'interactions', key: 'interactions' },
  { value: 'deals', key: 'deals' },
  { value: 'audit', key: 'audit' },
] as const

export function RerouteButton({ emailId, currentTarget }: { emailId: string; currentTarget: string | null }) {
  const t = useTranslations('Emails.detail')
  const router = useRouter()
  const confirm = useConfirm()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleReroute(to: string) {
    setOpen(false)
    const target = TARGETS.find(item => item.value === to)
    const targetLabel = target ? t(`reroute.targets.${target.key}`) : to
    const ok = await confirm({
      title: t('reroute.confirmTitle', { target: targetLabel }),
      description: t('reroute.confirmDescription'),
      confirmLabel: t('reroute.confirm'),
      variant: 'destructive',
    })
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch(`/api/emails/${emailId}/reroute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Reroute failed')
      }
      toast.success(t('reroute.success', { target: targetLabel }))
      setTimeout(() => router.refresh(), 800)
    } catch {
      toast.error(t('errors.reroute'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading} className="gap-1.5 shrink-0">
          <ArrowRightLeft className="h-4 w-4" />
          {t('reroute.action')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        {TARGETS.filter(target => target.value !== currentTarget).map(target => (
          <button
            key={target.value}
            onClick={() => handleReroute(target.value)}
            className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted"
          >
            {t(`reroute.targets.${target.key}`)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
