'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Metric } from '@/lib/types/database'
import { useFormatter, useTranslations } from 'next-intl'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyId: string
  metric: Metric
  onSuccess: () => void
}

export function AddDataPointDialog({
  open,
  onOpenChange,
  companyId,
  metric,
  onSuccess,
}: Props) {
  const t = useTranslations('CompanyDetail.dataPoint')
  const format = useFormatter()
  const [value, setValue] = useState('')
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear().toString())
  const [periodMonth, setPeriodMonth] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const buildPeriodLabel = () => {
    const yr = periodYear
    if (periodMonth) {
      return `${yr}-${periodMonth.padStart(2, '0')}`
    }
    return `FY ${yr}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    const pYear = parseInt(periodYear)
    if (isNaN(pYear)) {
      setError(t('errors.invalidYear'))
      setSaving(false)
      return
    }

    const label = buildPeriodLabel()
    const pMonth = periodMonth ? parseInt(periodMonth) : null
    const body: Record<string, unknown> = {
      period_label: label,
      period_year: pYear,
      period_quarter: pMonth ? Math.ceil(pMonth / 3) : null,
      period_month: pMonth,
      value: metric.value_type === 'text' ? value : parseFloat(value),
      notes: notes || null,
    }

    const res = await fetch(
      `/api/companies/${companyId}/metrics/${metric.id}/values`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? t('errors.addFailed'))
      setSaving(false)
      return
    }

    setSaving(false)
    onOpenChange(false)
    setValue('')
    setNotes('')
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('addTitle', { metric: metric.name })}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('year')}</Label>
              <Input
                type="number"
                value={periodYear}
                onChange={(e) => setPeriodYear(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>{t('month')}</Label>
              <select
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">{t('yearEndAnnual')}</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {format.dateTime(new Date(2000, i), { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>
              {t('value')}
              {metric.unit && (
                <span className="text-muted-foreground font-normal ml-1">({metric.unit})</span>
              )}
            </Label>
            <Input
              type={metric.value_type === 'text' ? 'text' : 'number'}
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>

          <div>
            <Label>{t('notesOptional')}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t('saving') : t('add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
