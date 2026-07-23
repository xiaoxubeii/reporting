'use client'

import { useLocale, useTranslations } from 'next-intl'

const LABELS = ['reporting', 'interactions', 'deals', 'audit', 'other'] as const

export function RoutingAccuracyView({ totalsByOriginal, weekly }: {
  totalsByOriginal: Record<string, number>
  weekly: Array<{ wk: string; flips: Array<[string, number]>; total: number }>
}) {
  const locale = useLocale()
  const t = useTranslations('Settings.emailRouting')
  const max = Math.max(...Object.values(totalsByOriginal), 1)
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t('accuracyDescription')}
      </p>

      <div className="rounded-md border bg-card p-4">
        <h2 className="text-sm font-medium mb-3">{t('totalCorrections')}</h2>
        {Object.keys(totalsByOriginal).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noCorrections')}</p>
        ) : (
          <div className="space-y-2">
            {LABELS.map(l => {
              const count = totalsByOriginal[l] ?? 0
              const pct = (count / max) * 100
              return (
                <div key={l} className="flex items-center gap-3">
                  <span className="w-28 text-sm">{t(`labels.${l}`)}</span>
                  <div className="flex-1 bg-muted rounded h-5 relative overflow-hidden">
                    <div className="bg-primary h-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 text-right text-sm text-muted-foreground">{new Intl.NumberFormat(locale).format(count)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <h2 className="text-sm font-medium p-4 pb-2">{t('weeklyCorrections')}</h2>
        {weekly.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">{t('noWeeklyData')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs uppercase font-medium text-muted-foreground">{t('week')}</th>
                <th className="px-3 py-2 text-left text-xs uppercase font-medium text-muted-foreground">{t('flips')}</th>
                <th className="px-3 py-2 text-right text-xs uppercase font-medium text-muted-foreground">{t('total')}</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map(({ wk, flips, total }) => (
                <tr key={wk} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{wk}</td>
                  <td className="px-3 py-2 text-xs">
                    {flips.map(([k, n]) => (
                      <span key={k} className="inline-block mr-3"><span className="font-mono">{k}</span> ×{new Intl.NumberFormat(locale).format(n)}</span>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right">{new Intl.NumberFormat(locale).format(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
