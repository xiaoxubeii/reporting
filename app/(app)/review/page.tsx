'use client'

import { useEffect, useState, useCallback } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Check, X, Pencil, Loader2, Mail } from 'lucide-react'
import { EmailReviewModal } from '@/components/email-review-modal'

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

interface NeedsReviewEmail {
  id: string
  from_address: string
  subject: string | null
  received_at: string
  company: { id: string; name: string } | null
}

interface ReviewData {
  total: number
  counts: Record<string, number>
  items: ReviewItem[]
  needsReviewEmails: NeedsReviewEmail[]
}

const ISSUE_KEYS = {
  new_company_detected: 'newCompany',
  low_confidence: 'lowConfidence',
  ambiguous_period: 'ambiguousPeriod',
  metric_not_found: 'metricNotFound',
  company_not_identified: 'unidentifiedCompany',
  duplicate_period: 'duplicatePeriod',
} as const

function issueKey(issueType: string) {
  return ISSUE_KEYS[issueType as keyof typeof ISSUE_KEYS]
}

const STATUS_COLORS: Record<string, string> = {
  new_company_detected: 'bg-blue-100 text-blue-800 border-blue-200',
  low_confidence: 'bg-amber-100 text-amber-800 border-amber-200',
  ambiguous_period: 'bg-orange-100 text-orange-800 border-orange-200',
  metric_not_found: 'bg-slate-100 text-slate-700 border-slate-200',
  company_not_identified: 'bg-red-100 text-red-800 border-red-200',
  duplicate_period: 'bg-purple-100 text-purple-800 border-purple-200',
}

export default function ReviewPage() {
  const t = useTranslations('Review')
  const format = useFormatter()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [data, setData] = useState<ReviewData | null>(null)
  const [resolving, setResolving] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [reviewModalEmailId, setReviewModalEmailId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/review')
      if (!res.ok) throw new Error('Failed to load')
      setData(await res.json())
    } catch {
      setData(null)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function resolve(
    item: ReviewItem,
    resolution: 'accepted' | 'rejected' | 'manually_corrected',
    resolvedValue?: string,
  ) {
    setResolving(prev => ({ ...prev, [item.id]: true }))
    try {
      const res = await fetch(`/api/review/${item.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution, resolved_value: resolvedValue }),
      })
      if (!res.ok) throw new Error('Failed to resolve')
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
          : prev,
      )
    } catch {
      toast.error(t('errors.resolve'))
    } finally {
      setResolving(prev => ({ ...prev, [item.id]: false }))
      setEditingId(null)
    }
  }

  const items = data?.items ?? []

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('description')}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 max-w-4xl w-full">
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {t('errors.load')}
        </div>
      )}

      {!loading && !loadError && items.length === 0 && (data?.needsReviewEmails ?? []).length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">{t('empty')}</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map(item => {
            const isEditing = editingId === item.id
            const isResolving = !!resolving[item.id]
            const hasValue = !!item.extracted_value
            const translatedIssueKey = issueKey(item.issue_type)

            return (
              <div key={item.id} className="rounded-lg border bg-card p-4 space-y-3">
                {/* Header row */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[item.issue_type] ?? ''}`}
                  >
                    {translatedIssueKey ? t(`issues.${translatedIssueKey}`) : item.issue_type}
                  </span>
                  {item.company && (
                    <Link
                      href={`/companies/${item.company.id}`}
                      className="text-sm font-medium hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      {item.company.name}
                    </Link>
                  )}
                  {item.metric && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-sm text-muted-foreground">{item.metric.name}</span>
                    </>
                  )}
                  {item.email && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {item.email.subject ?? t('noSubject')}, {format.dateTime(new Date(item.email.received_at), { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>

                {/* Extracted value */}
                {hasValue && !isEditing && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">{t('value')}</span>
                    <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">
                      {item.extracted_value}
                      {item.metric?.unit ? ` ${item.metric.unit}` : ''}
                    </span>
                  </div>
                )}

                {/* Inline edit */}
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
                    <Button
                      size="sm"
                      onClick={() => resolve(item, 'manually_corrected', editValue)}
                      disabled={isResolving || !editValue.trim()}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {t('actions.save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      {t('actions.cancel')}
                    </Button>
                  </div>
                )}

                {/* Context snippet */}
                {item.context_snippet && (
                  <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground italic leading-relaxed">
                    {item.context_snippet}
                  </blockquote>
                )}

                {/* Actions */}
                {!isEditing && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {item.issue_type === 'new_company_detected' || item.issue_type === 'company_not_identified' ? (
                      <Button size="sm" variant="outline" onClick={() => resolve(item, 'rejected')} disabled={isResolving} className="gap-1.5">
                        <X className="h-3.5 w-3.5" />
                        {t('actions.dismiss')}
                      </Button>
                    ) : (
                      <>
                        {item.issue_type !== 'metric_not_found' && hasValue && (
                          <Button size="sm" onClick={() => resolve(item, 'accepted')} disabled={isResolving} className="gap-1.5">
                            <Check className="h-3.5 w-3.5" />
                            {t('actions.accept')}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => resolve(item, 'rejected')} disabled={isResolving} className="gap-1.5">
                          <X className="h-3.5 w-3.5" />
                          {item.issue_type === 'metric_not_found' ? t('actions.dismiss') : t('actions.reject')}
                        </Button>
                        {hasValue && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(item.id)
                              setEditValue(item.extracted_value ?? '')
                            }}
                            disabled={isResolving}
                            className="gap-1.5"
                          >
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

      {!loading && (data?.needsReviewEmails ?? []).length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            {t('emailsNeedingReview', { count: data!.needsReviewEmails.length })}
          </h2>
          <div className="space-y-2">
            {data!.needsReviewEmails.map(email => (
              <button
                key={email.id}
                onClick={() => setReviewModalEmailId(email.id)}
                className="w-full rounded-lg border bg-card p-4 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {email.subject || t('noSubject')}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{email.from_address}</span>
                      <span>{format.dateTime(new Date(email.received_at), { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      {email.company ? (
                        <span>{email.company.name}</span>
                      ) : (
                        <span className="text-amber-600">{t('noCompanyAssigned')}</span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 shrink-0">
                    {t('needsReview')}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <EmailReviewModal
        emailId={reviewModalEmailId}
        open={!!reviewModalEmailId}
        onOpenChange={(open) => {
          if (!open) {
            setReviewModalEmailId(null)
            load()
          }
        }}
      />
    </div>
    </div>
    </div>
  )
}
