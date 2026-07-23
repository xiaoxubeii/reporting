'use client'

import { useEffect, useState } from 'react'
import { Loader2, BarChart3, Lock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useFormatter, useTranslations } from 'next-intl'

interface Analytics {
  summary: { total: number; active: number; passed: number; won: number; lost: number; on_hold: number }
  by_sector: Array<{ sector: string; total: number; won: number; lost: number; passed: number; active: number }>
  by_partner: Array<{ partner_id: string; partner_name: string | null; total: number; active: number; won: number; lost: number; passed: number }>
  funnel: { created: number; has_ingestion: number; has_research: number; has_qa: number; has_memo_draft: number; finalized: number; won: number }
  time_in_stage: {
    median_days_created_to_draft: number | null
    median_days_draft_to_final: number | null
    sample_created_to_draft: number
    sample_draft_to_final: number
  }
}

export function AnalyticsView() {
  const t = useTranslations('Diligence.analytics')
  const format = useFormatter()
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/diligence/analytics')
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 md:py-8 md:pl-8 md:pr-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> {t('title')}
          <Lock className="h-4 w-4 text-amber-500" />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('description')}
        </p>
      </div>

      {loading || !data ? (
        <div className="rounded-md border bg-card p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> {t('loading')}
        </div>
      ) : data.summary.total === 0 ? (
        <div className="rounded-md border bg-card p-12 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary chips, neutral; the label distinguishes status. */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <Stat label={t('stats.total')} value={data.summary.total} />
            <Stat label={t('stats.active')} value={data.summary.active} />
            <Stat label={t('stats.won')} value={data.summary.won} />
            <Stat label={t('stats.lost')} value={data.summary.lost} />
            <Stat label={t('stats.passed')} value={data.summary.passed} />
            <Stat label={t('stats.onHold')} value={data.summary.on_hold} />
          </div>

          {/* Funnel */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t('funnel.title')}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                {t('funnel.description')}
              </p>
              <Funnel funnel={data.funnel} />
            </CardContent>
          </Card>

          {/* Time-in-stage */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t('time.title')}</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">{t('time.createdToDraft')}</div>
                  <div className="text-2xl font-semibold tracking-tight">
                    {data.time_in_stage.median_days_created_to_draft !== null
                      ? t('time.days', { value: format.number(data.time_in_stage.median_days_created_to_draft, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
                      : '—'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{t('time.sample', { count: data.time_in_stage.sample_created_to_draft })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('time.draftToFinal')}</div>
                  <div className="text-2xl font-semibold tracking-tight">
                    {data.time_in_stage.median_days_draft_to_final !== null
                      ? t('time.days', { value: format.number(data.time_in_stage.median_days_draft_to_final, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
                      : '—'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{t('time.sample', { count: data.time_in_stage.sample_draft_to_final })}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* By sector */}
          {data.by_sector.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">{t('bySector')}</CardTitle></CardHeader>
              <CardContent>
                <div style={{ width: '100%', height: Math.max(180, data.by_sector.length * 40) }}>
                  <ResponsiveContainer>
                    <BarChart data={data.by_sector} layout="vertical" margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
                      <XAxis type="number" />
                      <YAxis dataKey="sector" type="category" width={140} />
                      <Tooltip />
                      <Bar dataKey="total" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* By partner */}
          {data.by_partner.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">{t('byPartner.title')}</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">{t('byPartner.partner')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('stats.total')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('stats.active')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('stats.won')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('stats.lost')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('stats.passed')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('byPartner.winRate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_partner.map(p => {
                        const decided = p.won + p.lost
                        const winRate = decided > 0 ? format.number(p.won / decided, { style: 'percent', maximumFractionDigits: 0 }) : '—'
                        return (
                          <tr key={p.partner_id} className="border-t">
                            <td className="px-3 py-2">{p.partner_name ?? <span className="font-mono text-xs text-muted-foreground">{p.partner_id.slice(0, 8)}</span>}</td>
                            <td className="px-3 py-2 text-right">{p.total}</td>
                            <td className="px-3 py-2 text-right">{p.active}</td>
                            <td className="px-3 py-2 text-right">{p.won}</td>
                            <td className="px-3 py-2 text-right">{p.lost}</td>
                            <td className="px-3 py-2 text-right">{p.passed}</td>
                            <td className="px-3 py-2 text-right font-medium">{winRate}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  const format = useFormatter()
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-2xl font-semibold tracking-tight">{format.number(value)}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}

function Funnel({ funnel }: { funnel: Analytics['funnel'] }) {
  const t = useTranslations('Diligence.analytics.funnel')
  const format = useFormatter()
  const steps: Array<{ label: string; value: number }> = [
    { label: t('created'), value: funnel.created },
    { label: t('ingestionDone'), value: funnel.has_ingestion },
    { label: t('researchDone'), value: funnel.has_research },
    { label: t('qaCaptured'), value: funnel.has_qa },
    { label: t('draftAssembled'), value: funnel.has_memo_draft },
    { label: t('finalized'), value: funnel.finalized },
    { label: t('won'), value: funnel.won },
  ]
  const max = Math.max(...steps.map(s => s.value), 1)

  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        const prev = i === 0 ? null : steps[i - 1].value
        const dropoff = prev && prev > 0 && s.value < prev ? Math.round(((prev - s.value) / prev) * 100) : null
        const pct = (s.value / max) * 100
        return (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 text-muted-foreground">{s.label}</span>
            <div className="flex-1 bg-muted rounded h-5 relative overflow-hidden">
              <div className="bg-primary/70 h-full transition-all" style={{ width: `${pct}%` }} />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-medium text-foreground">{format.number(s.value)}</span>
            </div>
            <span className="w-12 shrink-0 text-right text-xs">
              {dropoff !== null ? <span className="text-amber-600">−{format.number(dropoff / 100, { style: 'percent', maximumFractionDigits: 0 })}</span> : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
