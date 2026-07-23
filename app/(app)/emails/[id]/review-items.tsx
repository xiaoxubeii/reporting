'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CompanyForm } from '@/components/company-form'
import { Check, X, Pencil, Building2, Loader2 } from 'lucide-react'
import type { Company } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewItem {
  id: string
  issue_type: string
  extracted_value: string | null
  context_snippet: string | null
  created_at: string
  company: { id: string; name: string } | null
  metric: { id: string; name: string; unit: string | null; value_type: string } | null
  email: { id: string; subject: string | null; received_at: string; from_address: string } | null
}

interface ReviewData {
  total: number
  counts: Record<string, number>
  items: ReviewItem[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ISSUE_KEYS = {
  new_company_detected: 'newCompany',
  low_confidence: 'lowConfidence',
  ambiguous_period: 'ambiguousPeriod',
  metric_not_found: 'metricNotFound',
  company_not_identified: 'unidentifiedCompany',
  duplicate_period: 'duplicatePeriod',
} as const

const STATUS_COLORS: Record<string, string> = {
  new_company_detected: 'bg-blue-100 text-blue-800 border-blue-200',
  low_confidence: 'bg-amber-100 text-amber-800 border-amber-200',
  ambiguous_period: 'bg-orange-100 text-orange-800 border-orange-200',
  metric_not_found: 'bg-slate-100 text-slate-700 border-slate-200',
  company_not_identified: 'bg-red-100 text-red-800 border-red-200',
  duplicate_period: 'bg-purple-100 text-purple-800 border-purple-200',
}

// ---------------------------------------------------------------------------
// ReviewItems
// ---------------------------------------------------------------------------

export function ReviewItems({
  emailId,
}: {
  emailId: string
  hasReviews?: boolean
}) {
  const t = useTranslations('Review.items')
  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [createCompanyFor, setCreateCompanyFor] = useState<ReviewItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/emails/${emailId}/reviews`)
      if (!res.ok) throw new Error('Failed to load reviews')
      setData(await res.json())
    } catch {
      setData(null)
      toast.error(t('errors.load'))
    } finally {
      setLoading(false)
    }
  }, [emailId, t])

  useEffect(() => {
    load()
  }, [load])

  async function resolve(
    item: ReviewItem,
    resolution: 'accepted' | 'rejected' | 'manually_corrected',
    resolvedValue?: string
  ) {
    setResolving(prev => ({ ...prev, [item.id]: true }))
    try {
      const res = await fetch(`/api/review/${item.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution, resolved_value: resolvedValue }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to resolve')
      }
      setData(prev =>
        prev
          ? {
              ...prev,
              total: prev.total - 1,
              counts: {
                ...prev.counts,
                [item.issue_type]: (prev.counts[item.issue_type] ?? 1) - 1,
              },
              items: prev.items.filter(i => i.id !== item.id),
            }
          : prev
      )
    } catch {
      toast.error(t('errors.resolve'))
    } finally {
      setResolving(prev => ({ ...prev, [item.id]: false }))
      setEditingId(null)
    }
  }

  function startEdit(item: ReviewItem) {
    setEditingId(item.id)
    setEditValue(item.extracted_value ?? '')
  }

  function handleCompanyCreated(company: Company) {
    setCreateCompanyFor(null)
    if (createCompanyFor) {
      resolve(createCompanyFor, 'accepted', company.name)
    }
  }

  const items = data?.items ?? []
  const hasUnresolved = items.length > 0

  if (!hasUnresolved && !loading) return null

  return (
    <section>
      <h2 className="text-sm font-semibold mb-2">
        {loading ? t('title') : t('titleWithCount', { count: items.length })}
      </h2>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map(item => {
            const isEditing = editingId === item.id
            const isResolving = !!resolving[item.id]
            const hasValue = !!item.extracted_value
            const isNewCompany = item.issue_type === 'new_company_detected'
            const isUnidentified = item.issue_type === 'company_not_identified'
            const isMetricNotFound = item.issue_type === 'metric_not_found'
            const translatedIssueKey = ISSUE_KEYS[item.issue_type as keyof typeof ISSUE_KEYS]

            return (
              <div key={item.id} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[item.issue_type] ?? ''}`}
                  >
                    {translatedIssueKey
                      ? t(`issues.${translatedIssueKey}`)
                      : item.issue_type}
                  </span>
                  {item.company && (
                    <span className="text-sm font-medium">{item.company.name}</span>
                  )}
                  {!item.company && (
                    <span className="text-sm text-muted-foreground italic">{t('unknownCompany')}</span>
                  )}
                  {item.metric && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-sm text-muted-foreground">{item.metric.name}</span>
                    </>
                  )}
                </div>

                {hasValue && !isEditing && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">{t('value')}</span>
                    <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">
                      {item.extracted_value}
                      {item.metric?.unit ? ` ${item.metric.unit}` : ''}
                    </span>
                  </div>
                )}

                {isEditing && (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      className="h-8 w-40 font-mono text-sm"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') resolve(item, 'manually_corrected', editValue)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <Button size="sm" onClick={() => resolve(item, 'manually_corrected', editValue)} disabled={isResolving || !editValue.trim()}>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {t('actions.save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      {t('actions.cancel')}
                    </Button>
                  </div>
                )}

                {item.context_snippet && (
                  <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground italic leading-relaxed">
                    {item.context_snippet}
                  </blockquote>
                )}

                {!isEditing && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {isNewCompany ? (
                      <>
                        <Button size="sm" onClick={() => setCreateCompanyFor(item)} disabled={isResolving} className="gap-1.5">
                          <Building2 className="h-3.5 w-3.5" />
                          {t('actions.createCompany')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => resolve(item, 'rejected')} disabled={isResolving}>
                          <X className="h-3.5 w-3.5 mr-1" />
                          {t('actions.dismiss')}
                        </Button>
                      </>
                    ) : (
                      <>
                        {!isMetricNotFound && !isUnidentified && hasValue && (
                          <Button size="sm" onClick={() => resolve(item, 'accepted')} disabled={isResolving} className="gap-1.5">
                            <Check className="h-3.5 w-3.5" />
                            {t('actions.accept')}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => resolve(item, 'rejected')} disabled={isResolving} className="gap-1.5">
                          <X className="h-3.5 w-3.5" />
                          {isMetricNotFound || isUnidentified ? t('actions.dismiss') : t('actions.reject')}
                        </Button>
                        {hasValue && (
                          <Button size="sm" variant="outline" onClick={() => startEdit(item)} disabled={isResolving} className="gap-1.5">
                            <Pencil className="h-3.5 w-3.5" />
                            {t('actions.editAccept')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create Company Dialog */}
      <Dialog
        open={!!createCompanyFor}
        onOpenChange={o => !o && setCreateCompanyFor(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('createCompanyTitle')}</DialogTitle>
          </DialogHeader>
          <CompanyForm
            initialName={createCompanyFor?.extracted_value ?? ''}
            onSuccess={handleCompanyCreated}
            onCancel={() => setCreateCompanyFor(null)}
          />
        </DialogContent>
      </Dialog>
    </section>
  )
}
