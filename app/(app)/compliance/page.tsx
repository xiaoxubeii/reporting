'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ChevronRight, Check, AlertTriangle, X, ExternalLink, Clock, Loader2, Link as LinkIcon } from 'lucide-react'
import { PortfolioNotesProvider, PortfolioNotesButton, PortfolioNotesPanel } from '@/components/portfolio-notes'
import { evaluateAll, type ComplianceProfile, type Applicability } from '@/lib/compliance/applicability'
import { ComplianceNav, type ComplianceTab } from './compliance-nav'

interface ComplianceItem {
  id: string
  category: string
  name: string
  short_name: string
  description: string
  frequency: string
  deadline_description: string
  deadline_month: number | null
  deadline_day: number | null
  applicability_text: string
  filing_system: string
  filing_portal_url: string | null
  regulation_url: string | null
  complexity: string
  notes: string | null
  alert: string | null
  sort_order: number
  scope: 'firm' | 'vehicle'
}

interface FundSetting {
  compliance_item_id: string
  portfolio_group: string
  applies: string | null
  dismissed: boolean
  dismissed_reason: string | null
  completed: boolean
  completed_at: string | null
  completed_note: string | null
  completed_link: string | null
  notes: string | null
}

interface ComplianceLink {
  id: string
  compliance_item_id: string | null
  title: string
  description: string | null
  url: string
}

// Intake questions
const QUESTIONS = [
  {
    key: 'registration_status',
    translationKey: 'registrationStatus',
    options: [
      { value: 'ria', translationKey: 'ria' },
      { value: 'era', translationKey: 'era' },
      { value: 'not_registered', translationKey: 'notRegistered' },
      { value: 'unsure', translationKey: 'unsure' },
    ],
  },
  {
    key: 'aum_range',
    translationKey: 'aumRange',
    options: [
      { value: 'under_25m', translationKey: 'under25m' },
      { value: '25m_100m', translationKey: 'from25mTo100m' },
      { value: '100m_150m', translationKey: 'from100mTo150m' },
      { value: '150m_500m', translationKey: 'from150mTo500m' },
      { value: '500m_1.5b', translationKey: 'from500mTo1_5b' },
      { value: 'over_1.5b', translationKey: 'over1_5b' },
      { value: 'unsure', translationKey: 'unsure' },
    ],
  },
  {
    key: 'fund_structure',
    translationKey: 'fundStructure',
    options: [
      { value: 'lp', translationKey: 'limitedPartnership' },
      { value: 'llc_partnership', translationKey: 'llcPartnership' },
      { value: 'llc_corp', translationKey: 'llcCorporation' },
      { value: 'other', translationKey: 'other' },
    ],
  },
  {
    key: 'fundraising_status',
    translationKey: 'fundraisingStatus',
    options: [
      { value: 'actively_raising', translationKey: 'activelyRaising' },
      { value: 'closed_recent', translationKey: 'closedRecent' },
      { value: 'closed_over_12m', translationKey: 'closedOver12m' },
      { value: 'evergreen', translationKey: 'evergreen' },
    ],
  },
  {
    key: 'reg_d_exemption',
    translationKey: 'regDExemption',
    options: [
      { value: '506b', translationKey: 'rule506b' },
      { value: '506c', translationKey: 'rule506c' },
      { value: 'no', translationKey: 'no' },
      { value: 'unsure', translationKey: 'unsure' },
    ],
  },
  {
    key: 'investor_state_count',
    translationKey: 'investorStateCount',
    options: [
      { value: 'single_state', translationKey: 'singleState' },
      { value: '2_to_5', translationKey: 'twoToFive' },
      { value: '6_to_15', translationKey: 'sixToFifteen' },
      { value: '16_plus', translationKey: 'sixteenPlus' },
      { value: 'unsure', translationKey: 'unsure' },
    ],
  },
  {
    key: 'california_nexus',
    translationKey: 'californiaNexus',
    multi: true,
    options: [
      { value: 'hq_ca', translationKey: 'headquarters' },
      { value: 'investors_ca', translationKey: 'investors' },
      { value: 'investments_ca', translationKey: 'investments' },
      { value: 'fundraising_ca', translationKey: 'fundraising' },
      { value: 'none', translationKey: 'none' },
    ],
  },
  {
    key: 'public_equity',
    translationKey: 'publicEquity',
    options: [
      { value: 'yes_over_100m', translationKey: 'over100m' },
      { value: 'yes_under_100m', translationKey: 'under100m' },
      { value: 'yes_5pct_single', translationKey: 'fivePercent' },
      { value: 'no', translationKey: 'no' },
      { value: 'unsure', translationKey: 'unsure' },
    ],
  },
  {
    key: 'cftc_activity',
    translationKey: 'cftcActivity',
    options: [
      { value: 'yes_with_exemption', translationKey: 'withExemption' },
      { value: 'yes_no_exemption', translationKey: 'withoutExemption' },
      { value: 'no', translationKey: 'no' },
      { value: 'unsure', translationKey: 'unsure' },
    ],
  },
  {
    key: 'access_person_count',
    translationKey: 'accessPersonCount',
    options: [
      { value: '1_to_3', translationKey: 'oneToThree' },
      { value: '4_to_10', translationKey: 'fourToTen' },
      { value: '11_plus', translationKey: 'elevenPlus' },
    ],
  },
  {
    key: 'has_foreign_entities',
    translationKey: 'foreignEntities',
    options: [
      { value: 'yes', translationKey: 'yes' },
      { value: 'no', translationKey: 'no' },
    ],
  },
  {
    key: 'has_foreign_investors',
    translationKey: 'foreignInvestors',
    options: [
      { value: 'yes', translationKey: 'yes' },
      { value: 'no', translationKey: 'no' },
      { value: 'unsure', translationKey: 'unsure' },
    ],
  },
] as const

type View = ComplianceTab
type StatusFilter = 'active' | 'completed' | 'dismissed' | 'all'

const STATUS_COLORS: Record<Applicability | 'monitor', { bg: string; text: string; icon: typeof Check }> = {
  applies: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: Check },
  completed: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: Check },
  not_applicable: { bg: 'bg-muted', text: 'text-muted-foreground', icon: X },
  needs_review: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', icon: AlertTriangle },
  monitor: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: Clock },
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'SEC Filings':           { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  'Securities Offerings':  { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  'Tax Filings':           { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  'Internal Compliance':   { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  'Fund Reporting':        { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
  'State Compliance':      { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-400' },
  'CFTC':                  { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  'AML / FinCEN':          { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
}
const DEFAULT_CATEGORY_COLORS = { bg: 'bg-muted', text: 'text-muted-foreground' }

type CalendarEntry = { item: ComplianceItem; group?: string }
const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'] as const

function entryKey(e: CalendarEntry) {
  return e.group ? `${e.item.id}::${e.group}` : e.item.id
}

function translatedLabel(labels: Readonly<Record<string, string>>, value: string) {
  return labels[value] ?? value
}

export default function CompliancePage() {
  const t = useTranslations('Compliance')
  const searchParams = useSearchParams()
  const initialView = (['calendar', 'items', 'setup'].includes(searchParams.get('view') ?? '') ? searchParams.get('view') as View : 'calendar')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ComplianceItem[]>([])
  const [profile, setProfile] = useState<ComplianceProfile | null>(null)
  const [fundSettings, setFundSettings] = useState<FundSetting[]>([])
  const [portfolioGroups, setPortfolioGroups] = useState<string[]>([])
  const [closeMonths, setCloseMonths] = useState<Record<string, number[]>>({})
  const [view, setView] = useState<View>(initialView)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [links, setLinks] = useState<ComplianceLink[]>([])

  // Intake state
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/compliance').then(r => r.json()),
      fetch('/api/compliance/links').then(r => r.json()),
    ])
      .then(([d, linksData]) => {
        setItems(d.items ?? [])
        setFundSettings(d.settings ?? [])
        setPortfolioGroups(d.portfolioGroups ?? [])
        setCloseMonths(d.closeMonths ?? {})
        setLinks(Array.isArray(linksData) ? linksData : [])
        if (d.profile) {
          setProfile(d.profile)
          // Pre-fill answers from existing profile
          const a: Record<string, string | string[]> = {}
          for (const q of QUESTIONS) {
            const val = d.profile[q.key]
            if (val != null) a[q.key] = val
          }
          setAnswers(a)
          // Only override view if no query param was provided
          if (!searchParams.get('view')) setView('calendar')
        } else {
          setView('setup')
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [searchParams])

  // Compute applicability from profile
  const applicability = useMemo(() => {
    if (!profile) return {}
    return evaluateAll(profile)
  }, [profile])

  // Get setting for an item (optionally scoped to a portfolio group)
  const getSetting = useCallback((itemId: string, group?: string): FundSetting | undefined => {
    const pg = group ?? ''
    return fundSettings.find(s => s.compliance_item_id === itemId && (s.portfolio_group ?? '') === pg)
  }, [fundSettings])

  // Get effective status for an item (optionally scoped to a portfolio group)
  const getStatus = useCallback((itemId: string, group?: string): Applicability => {
    const setting = getSetting(itemId, group)
    if (setting?.completed) return 'completed'
    if (setting?.dismissed) return 'not_applicable'
    if (setting?.applies === 'yes') return 'applies'
    if (setting?.applies === 'no') return 'not_applicable'
    return applicability[itemId]?.result ?? 'needs_review'
  }, [getSetting, applicability])

  // Count answered questions
  const answeredCount = Object.keys(answers).filter(k => {
    const val = answers[k]
    if (Array.isArray(val)) return val.length > 0
    return val != null && val !== ''
  }).length

  // Submit intake
  async function handleSubmitIntake() {
    setSaving(true)
    try {
      const profileData: Record<string, unknown> = {}
      for (const q of QUESTIONS) {
        profileData[q.key] = answers[q.key] ?? null
      }

      const res = await fetch('/api/compliance/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
      })
      if (!res.ok) throw new Error('Failed to save profile')
      const savedProfile = await res.json()
      setProfile(savedProfile)

      // Evaluate and bulk-set applicability
      const results = evaluateAll(savedProfile as ComplianceProfile)
      const settings = Object.entries(results).map(([itemId, { result, reason }]) => ({
        compliance_item_id: itemId,
        applies: result === 'applies' ? 'yes' : result === 'not_applicable' ? 'no' : 'unsure',
        dismissed: result === 'not_applicable',
        dismissed_reason: result === 'not_applicable' ? reason : undefined,
      }))

      const settingsRes = await fetch('/api/compliance/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      if (settingsRes.ok) {
        const savedSettings = await settingsRes.json()
        setFundSettings(savedSettings)
      }

      setView('calendar')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  // Toggle dismiss/restore (optionally scoped to a portfolio group)
  async function handleToggleDismiss(itemId: string, dismiss: boolean, reason?: string, group?: string) {
    const pg = group ?? ''
    const res = await fetch('/api/compliance/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compliance_item_id: itemId,
        portfolio_group: pg,
        dismissed: dismiss,
        dismissed_reason: reason,
        applies: dismiss ? 'no' : 'unsure',
        // Clear completed when dismissing
        ...(dismiss ? { completed: false } : {}),
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setFundSettings(prev => {
        const others = prev.filter(s => !(s.compliance_item_id === itemId && (s.portfolio_group ?? '') === pg))
        return [...others, updated]
      })
    }
  }

  // Mark an item as completed (with optional note and link)
  async function handleMarkComplete(itemId: string, completed: boolean, note?: string, link?: string, group?: string) {
    const pg = group ?? ''
    const res = await fetch('/api/compliance/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compliance_item_id: itemId,
        portfolio_group: pg,
        completed,
        completed_note: note || null,
        completed_link: link || null,
        // Clear dismissed when completing
        ...(completed ? { dismissed: false } : {}),
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setFundSettings(prev => {
        const others = prev.filter(s => !(s.compliance_item_id === itemId && (s.portfolio_group ?? '') === pg))
        return [...others, updated]
      })
    }
  }

  // Check if an item passes the current status filter
  const passesFilter = useCallback((status: Applicability): boolean => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'active') return status !== 'not_applicable' && status !== 'completed'
    if (statusFilter === 'completed') return status === 'completed'
    if (statusFilter === 'dismissed') return status === 'not_applicable'
    return true
  }, [statusFilter])

  // Calendar items grouped by month
  const calendarData = useMemo(() => {
    const months: Record<number, CalendarEntry[]> = {}
    for (let m = 1; m <= 12; m++) months[m] = []
    function addToMonths(entry: CalendarEntry, monthList: number[]) {
      for (const m of monthList) months[m].push(entry)
    }

    const QUARTERLY_MONTHS: Record<string, number[]> = {
      'valuations-soi': [3, 6, 9, 12],
      'partnership-expenses': [3, 6, 9, 12],
      'quarterly-financial-reporting': [3, 5, 8, 11],
    }
    const DEFAULT_QUARTERLY = [1, 4, 7, 10]
    const QUARTER_LABELS: Record<number, string> = { 1: 'Q1', 2: 'Q1', 3: 'Q1', 4: 'Q2', 5: 'Q2', 6: 'Q2', 7: 'Q3', 8: 'Q3', 9: 'Q3', 10: 'Q4', 11: 'Q4', 12: 'Q4' }

    function placeItem(item: ComplianceItem, group?: string) {
      if (item.deadline_month) {
        const status = getStatus(item.id, group)
        if (!passesFilter(status)) return
        months[item.deadline_month].push({ item, group })
      } else if (item.frequency === 'Quarterly') {
        const qMonths = QUARTERLY_MONTHS[item.id] ?? DEFAULT_QUARTERLY
        for (const m of qMonths) {
          const qLabel = QUARTER_LABELS[m]
          const qGroup = group ? `${group}::${qLabel}` : qLabel
          const status = getStatus(item.id, qGroup)
          if (!passesFilter(status)) continue
          months[m].push({ item, group: qGroup })
        }
      } else {
        // Event-driven items (Form D, Blue Sky) — only show for funds
        // with a current-year vintage (new fund/SPV this year)
      }
    }

    // Portfolio groups that had closes (commitment entries) this year
    const groupsWithCloses = Object.keys(closeMonths).filter(pg => closeMonths[pg].length > 0)

    for (const item of items) {
      if (item.frequency === 'Event-driven') {
        for (const pg of groupsWithCloses) {
          const status = getStatus(item.id, pg)
          if (!passesFilter(status)) continue
          addToMonths({ item, group: pg }, closeMonths[pg])
        }
      } else if (item.scope === 'vehicle') {
        for (const pg of portfolioGroups) {
          if (item.frequency === 'Quarterly') {
            placeItem(item, pg)
          } else {
            const status = getStatus(item.id, pg)
            if (!passesFilter(status)) continue
            placeItem(item, pg)
          }
        }
      } else {
        if (item.frequency === 'Quarterly') {
          placeItem(item)
        } else {
          const status = getStatus(item.id)
          if (!passesFilter(status)) continue
          placeItem(item)
        }
      }
    }
    return { months }
  }, [items, getStatus, passesFilter, portfolioGroups, closeMonths])


  if (loading) {
    return (
      <div className="p-4 md:py-8 md:pl-8 md:pr-4 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <PortfolioNotesProvider pageContext="compliance">
    <div className="p-4 md:py-8 md:pl-8 md:pr-4">
      <div className="mb-6 space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <div className="flex items-center gap-2">
            <PortfolioNotesButton />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
        {profile && (
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
            <ComplianceNav active={view} onSelect={(tab) => setView(tab)} />
            {(view === 'calendar' || view === 'items') && (
              <div className="flex items-center rounded-md border text-xs">
                {(['active', 'completed', 'dismissed', 'all'] as const).map((f, i, arr) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1 capitalize transition-colors ${
                      i === 0 ? 'rounded-l-md' : i === arr.length - 1 ? 'rounded-r-md' : ''
                    } ${
                      statusFilter === f
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t(`filters.${f}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 max-w-5xl w-full">
          {view === 'setup' && (
            <IntakeQuestionnaire
              answers={answers}
              setAnswers={setAnswers}
              answeredCount={answeredCount}
              totalCount={QUESTIONS.length}
              onSubmit={handleSubmitIntake}
              saving={saving}
              isEdit={!!profile}
            />
          )}

          {view === 'calendar' && (
            <CalendarView
              calendarData={calendarData}
              items={items}
              getStatus={getStatus}
              applicability={applicability}
              getSetting={getSetting}
              onToggleDismiss={handleToggleDismiss}
              onMarkComplete={handleMarkComplete}
              links={links}
            />
          )}

          {view === 'items' && (
            <ItemsView
              items={items}
              getStatus={getStatus}
              applicability={applicability}
              getSetting={getSetting}
              expandedItem={expandedItem}
              setExpandedItem={setExpandedItem}
              statusFilter={statusFilter}
              onToggleDismiss={handleToggleDismiss}
              onMarkComplete={handleMarkComplete}
              links={links}
              portfolioGroups={portfolioGroups}
              closeMonths={closeMonths}
            />
          )}
        </div>
        <PortfolioNotesPanel />
      </div>
    </div>
    </PortfolioNotesProvider>
  )
}

// --- Intake Questionnaire ---
function IntakeQuestionnaire({
  answers, setAnswers, answeredCount, totalCount, onSubmit, saving, isEdit,
}: {
  answers: Record<string, string | string[]>
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>
  answeredCount: number
  totalCount: number
  onSubmit: () => void
  saving: boolean
  isEdit: boolean
}) {
  const t = useTranslations('Compliance')

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-medium mb-1">{isEdit ? t('setup.updateTitle') : t('setup.title')}</h2>
        <p className="text-sm text-muted-foreground mb-3">
          {t('setup.description')}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-foreground h-full rounded-full transition-all"
              style={{ width: `${(answeredCount / totalCount) * 100}%` }}
            />
          </div>
          <span>{t('setup.progress', { answered: answeredCount, total: totalCount })}</span>
        </div>
      </div>

      <div className="space-y-6">
        {QUESTIONS.map((q, idx) => {
          const currentVal = answers[q.key]
          return (
            <div key={q.key} className="rounded-lg border p-4">
              <p className="font-medium text-sm mb-1">
                <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                {t(`setup.questions.${q.translationKey}.question`)}
              </p>
              <p className="text-xs text-muted-foreground mb-3">{t(`setup.questions.${q.translationKey}.explainer`)}</p>
              {'multi' in q && q.multi ? (
                <div className="space-y-1.5">
                  {q.options.map(opt => {
                    const selected = Array.isArray(currentVal) && currentVal.includes(opt.value)
                    const isNone = opt.value === 'none'
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setAnswers(prev => {
                            const arr = Array.isArray(prev[q.key]) ? [...(prev[q.key] as string[])] : []
                            if (isNone) return { ...prev, [q.key]: ['none'] }
                            const filtered = arr.filter(v => v !== 'none')
                            if (filtered.includes(opt.value)) {
                              return { ...prev, [q.key]: filtered.filter(v => v !== opt.value) }
                            }
                            return { ...prev, [q.key]: [...filtered, opt.value] }
                          })
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm border transition-colors ${
                          selected
                            ? 'border-foreground bg-accent font-medium'
                            : 'border-border hover:bg-accent/50'
                        }`}
                      >
                        {t(`setup.questions.${q.translationKey}.options.${opt.translationKey}` as never)}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {q.options.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setAnswers(prev => ({ ...prev, [q.key]: opt.value }))}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm border transition-colors ${
                        currentVal === opt.value
                          ? 'border-foreground bg-accent font-medium'
                          : 'border-border hover:bg-accent/50'
                      }`}
                    >
                      {t(`setup.questions.${q.translationKey}.options.${opt.translationKey}` as never)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={onSubmit} disabled={saving || answeredCount === 0}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {isEdit ? t('setup.updateAndEvaluate') : t('setup.saveAndEvaluate')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {answeredCount < totalCount
            ? t('setup.unanswered', { count: totalCount - answeredCount })
            : t('setup.allAnswered')}
        </span>
      </div>
    </div>
  )
}

// --- Calendar View ---
function CalendarView({
  calendarData, items, getStatus, applicability, getSetting,
  onToggleDismiss, onMarkComplete, links,
}: {
  calendarData: { months: Record<number, CalendarEntry[]> }
  items: ComplianceItem[]
  getStatus: (id: string, group?: string) => Applicability
  applicability: Record<string, { result: Applicability; reason: string }>
  getSetting: (id: string, group?: string) => FundSetting | undefined
  onToggleDismiss: (id: string, dismiss: boolean, reason?: string, group?: string) => void
  onMarkComplete: (id: string, completed: boolean, note?: string, link?: string, group?: string) => void
  links: ComplianceLink[]
}) {
  const format = useFormatter()
  const t = useTranslations('Compliance')
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  // Track which entry is expanded (item id + optional group)
  const [expandedEntry, setExpandedEntry] = useState<{ itemId: string; group?: string } | null>(null)
  // Months that have entries
  const activeMonths = Array.from({ length: 12 }, (_, i) => i + 1)
    .filter(month => (calendarData.months[month] ?? []).length > 0)

  return (
    <div>
      {/* Two-column on desktop, single-column on mobile */}
      <div className="flex flex-col lg:flex-row gap-5 mb-6">
        {/* Month boxes column */}
        <div className="w-full lg:w-80 lg:shrink-0 space-y-3">
          {activeMonths.map(month => {
            const entries = calendarData.months[month] ?? []
            const isPast = month < currentMonth
            const isCurrent = month === currentMonth
            return (
              <div
                key={month}
                className={`rounded-lg border p-3 ${isPast ? 'opacity-60' : ''}`}
              >
                <p className={`text-base font-semibold mb-2 ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {format.dateTime(new Date(Date.UTC(2024, month - 1, 1)), { month: 'short', timeZone: 'UTC' })}
                </p>
                <div className="space-y-1">
                  {entries.map(entry => {
                    const { item, group } = entry
                    const status = getStatus(item.id, group)
                    const colors = status === 'not_applicable'
                      ? { bg: 'bg-muted', text: 'text-muted-foreground' }
                      : status === 'completed'
                        ? { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' }
                        : (CATEGORY_COLORS[item.category] ?? DEFAULT_CATEGORY_COLORS)
                    const ek = entryKey(entry)
                    const isExpanded = expandedEntry?.itemId === item.id && expandedEntry?.group === group
                    return (
                      <div key={ek}>
                        <button
                          onClick={() => setExpandedEntry(isExpanded ? null : { itemId: item.id, group })}
                          className={`w-full text-left px-2 py-1 rounded text-xs ${
                            isExpanded ? 'ring-1 ring-foreground' : ''
                          } ${colors.bg} ${colors.text} hover:opacity-80 transition-opacity`}
                        >
                          {item.short_name}
                          {group && <span className="ml-1 opacity-70">· {group}</span>}
                          {item.deadline_day && item.deadline_month && !group && (
                            <span className="ml-1 opacity-70">
                              ({format.dateTime(new Date(Date.UTC(2024, item.deadline_month - 1, item.deadline_day)), { month: 'numeric', day: 'numeric', timeZone: 'UTC' })})
                            </span>
                          )}
                        </button>
                        {/* Inline detail on mobile */}
                        {isExpanded && (
                          <div className="mt-2 mb-1 lg:hidden">
                            <ItemDetail
                              item={items.find(i => i.id === item.id)!}
                              status={getStatus(item.id, group)}
                              reason={applicability[item.id]?.reason}
                              setting={getSetting(item.id, group)}
                              group={group}
                              onClose={() => setExpandedEntry(null)}
                              onToggleDismiss={onToggleDismiss}
                              onMarkComplete={onMarkComplete}
                              links={links.filter(l => l.compliance_item_id === item.id)}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

        </div>

        {/* Detail panel, sticky on the right, desktop only */}
        <div className="hidden lg:block flex-1 min-w-0">
          {expandedEntry ? (
            <div className="sticky top-8 [&>div]:mt-0">
              <ItemDetail
                item={items.find(i => i.id === expandedEntry.itemId)!}
                status={getStatus(expandedEntry.itemId, expandedEntry.group)}
                reason={applicability[expandedEntry.itemId]?.reason}
                setting={getSetting(expandedEntry.itemId, expandedEntry.group)}
                group={expandedEntry.group}
                onClose={() => setExpandedEntry(null)}
                onToggleDismiss={onToggleDismiss}
                onMarkComplete={onMarkComplete}
                links={links.filter(l => l.compliance_item_id === expandedEntry.itemId)}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              {t('calendar.selectItem')}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

// --- Items List View ---
type ItemInstance = { item: ComplianceItem; group?: string }

function instanceKey(inst: ItemInstance) {
  return inst.group ? `${inst.item.id}::${inst.group}` : inst.item.id
}

function ItemsView({
  items, getStatus, applicability, getSetting, expandedItem, setExpandedItem,
  statusFilter, onToggleDismiss, onMarkComplete, links,
  portfolioGroups, closeMonths,
}: {
  items: ComplianceItem[]
  getStatus: (id: string, group?: string) => Applicability
  applicability: Record<string, { result: Applicability; reason: string }>
  getSetting: (id: string, group?: string) => FundSetting | undefined
  expandedItem: string | null
  setExpandedItem: (id: string | null) => void
  statusFilter: StatusFilter
  onToggleDismiss: (id: string, dismiss: boolean, reason?: string, group?: string) => void
  onMarkComplete: (id: string, completed: boolean, note?: string, link?: string, group?: string) => void
  links: ComplianceLink[]
  portfolioGroups: string[]
  closeMonths: Record<string, number[]>
}) {
  const t = useTranslations('Compliance')
  const categoryLabels = {
    'SEC Filings': t('categories.secFilings'),
    'Securities Offerings': t('categories.securitiesOfferings'),
    'Tax Filings': t('categories.taxFilings'),
    'Fund Reporting': t('categories.fundReporting'),
    'Internal Compliance': t('categories.internalCompliance'),
    'State Compliance': t('categories.stateCompliance'),
    CFTC: t('categories.cftc'),
    'AML / FinCEN': t('categories.amlFinCen'),
  }
  const CATEGORY_ORDER = ['SEC Filings', 'Securities Offerings', 'Tax Filings', 'Fund Reporting', 'Internal Compliance', 'State Compliance', 'CFTC', 'AML / FinCEN']
  // Build instances: expand vehicle-scoped items per fund, quarterly items per quarter
  const categoryInstances = useMemo(() => {
    const groups: Record<string, ItemInstance[]> = {}
    const groupsWithCloses = Object.keys(closeMonths).filter(pg => closeMonths[pg].length > 0)

    function passesFilter(status: Applicability) {
      if (statusFilter === 'all') return true
      if (statusFilter === 'active') return status !== 'not_applicable' && status !== 'completed'
      if (statusFilter === 'completed') return status === 'completed'
      if (statusFilter === 'dismissed') return status === 'not_applicable'
      return true
    }

    function addInstance(item: ComplianceItem, group?: string) {
      const status = getStatus(item.id, group)
      if (!passesFilter(status)) return
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push({ item, group })
    }

    for (const item of items) {
      if (item.frequency === 'Event-driven') {
        // One instance per fund that had closes this year
        for (const pg of groupsWithCloses) {
          addInstance(item, pg)
        }
      } else if (item.frequency === 'Quarterly') {
        if (item.scope === 'vehicle') {
          // Per fund × per quarter
          for (const pg of portfolioGroups) {
            for (const qLabel of QUARTER_LABELS) {
              addInstance(item, `${pg}::${qLabel}`)
            }
          }
        } else {
          // Firm-level quarterly: one per quarter
          for (const qLabel of QUARTER_LABELS) {
            addInstance(item, qLabel)
          }
        }
      } else if (item.scope === 'vehicle') {
        // Annual vehicle-scoped: one per fund
        for (const pg of portfolioGroups) {
          addInstance(item, pg)
        }
      } else {
        // Firm-level annual: single instance
        addInstance(item)
      }
    }
    return groups
  }, [items, getStatus, statusFilter, portfolioGroups, closeMonths])

  const orderedCategories = CATEGORY_ORDER.filter(c => (categoryInstances[c]?.length ?? 0) > 0)

  return (
    <div>
      {orderedCategories.map(category => {
        const catColors = CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLORS
        const instances = categoryInstances[category]
        return (
          <div key={category} className="mb-6">
            <h3 className={`text-xs font-medium mb-2 ${catColors.text}`}>
              {t('items.categoryCount', { category: translatedLabel(categoryLabels, category), count: instances.length })}
            </h3>
            <div className="space-y-1">
              {instances.map(inst => {
                const ik = instanceKey(inst)
                const status = getStatus(inst.item.id, inst.group)
                const isDismissed = status === 'not_applicable'
                const isCompleted = status === 'completed'
                const colors = isDismissed
                  ? { bg: 'bg-muted', text: 'text-muted-foreground' }
                  : isCompleted
                    ? { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' }
                    : catColors
                const isExpanded = expandedItem === ik
                return (
                  <div key={ik}>
                    <button
                      onClick={() => setExpandedItem(isExpanded ? null : ik)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm flex items-center justify-between transition-colors ${
                        isExpanded ? 'bg-accent border-foreground/20' : 'hover:bg-accent/50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${colors.bg}`} />
                        <span className={`font-medium ${isDismissed ? 'text-muted-foreground line-through' : ''} ${isCompleted ? 'text-blue-700 dark:text-blue-400' : ''}`}>
                          {inst.item.short_name}
                        </span>
                        {inst.group && <span className="text-xs text-muted-foreground">· {inst.group}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        {isCompleted && <span className="text-xs text-blue-600 dark:text-blue-400">{t('statuses.completed')}</span>}
                        {isDismissed && <span className="text-xs text-muted-foreground">{t('statuses.dismissed')}</span>}
                        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </span>
                    </button>
                    {isExpanded && (
                      <ItemDetail
                        item={inst.item}
                        status={status}
                        reason={applicability[inst.item.id]?.reason}
                        setting={getSetting(inst.item.id, inst.group)}
                        group={inst.group}
                        onClose={() => setExpandedItem(null)}
                        onToggleDismiss={onToggleDismiss}
                        onMarkComplete={onMarkComplete}
                        links={links.filter(l => l.compliance_item_id === inst.item.id)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- Item Detail Panel ---
function ItemDetail({
  item, status, reason, setting, group, onClose, onToggleDismiss, onMarkComplete, links,
}: {
  item: ComplianceItem
  status: Applicability
  reason?: string
  setting?: FundSetting
  group?: string
  onClose: () => void
  onToggleDismiss: (id: string, dismiss: boolean, reason?: string, group?: string) => void
  onMarkComplete: (id: string, completed: boolean, note?: string, link?: string, group?: string) => void
  links?: ComplianceLink[]
}) {
  const format = useFormatter()
  const t = useTranslations('Compliance')
  const categoryLabels = {
    'SEC Filings': t('categories.secFilings'),
    'Securities Offerings': t('categories.securitiesOfferings'),
    'Tax Filings': t('categories.taxFilings'),
    'Fund Reporting': t('categories.fundReporting'),
    'Internal Compliance': t('categories.internalCompliance'),
    'State Compliance': t('categories.stateCompliance'),
    CFTC: t('categories.cftc'),
    'AML / FinCEN': t('categories.amlFinCen'),
  }
  const frequencyLabels = {
    Annual: t('frequencies.annual'),
    Quarterly: t('frequencies.quarterly'),
    'Event-driven': t('frequencies.eventDriven'),
    Monthly: t('frequencies.monthly'),
    Ongoing: t('frequencies.ongoing'),
  }
  const complexityLabels = {
    low: t('complexities.low'),
    medium: t('complexities.medium'),
    high: t('complexities.high'),
  }
  const [showCompleteForm, setShowCompleteForm] = useState(false)
  const [completeNote, setCompleteNote] = useState(setting?.completed_note ?? '')
  const [completeLink, setCompleteLink] = useState(setting?.completed_link ?? '')

  if (!item) return null

  const isCompleted = status === 'completed'
  const isDismissed = status === 'not_applicable' && setting?.dismissed

  return (
    <div className="rounded-lg border bg-card p-4 mt-2 mb-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium text-sm">{item.name}{group && <span className="text-muted-foreground font-normal"> · {group}</span>}</h3>
          <p className="text-sm text-muted-foreground">
            {translatedLabel(categoryLabels, item.category)} · {translatedLabel(frequencyLabels, item.frequency)} · {t('detail.complexity', { complexity: translatedLabel(complexityLabels, item.complexity.toLowerCase()) })}
          </p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label={t('detail.close')}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {isCompleted && (
        <div className="text-sm px-2.5 py-1.5 rounded mb-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
          <span className="font-medium">{t('statuses.completed')}</span>
          {setting?.completed_at && (
            <span> {t('detail.completedOn', { date: format.dateTime(new Date(setting.completed_at)) })}</span>
          )}
          {setting?.completed_note && <p className="mt-1">{setting.completed_note}</p>}
          {setting?.completed_link && (
            <a href={setting.completed_link} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 underline underline-offset-2 hover:opacity-80">
              <LinkIcon className="h-3 w-3" />{setting.completed_link}
            </a>
          )}
        </div>
      )}

      <p className="text-sm text-muted-foreground mb-3">{item.description}</p>

      {reason && !isCompleted && (
        <div className={`text-sm px-2.5 py-1.5 rounded mb-3 ${STATUS_COLORS[status].bg} ${STATUS_COLORS[status].text}`}>
          {reason}
        </div>
      )}

      {item.alert && (
        <div className="text-sm px-2.5 py-1.5 rounded mb-3 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
          {item.alert}
        </div>
      )}

      {item.notes && (
        <p className="text-sm text-muted-foreground mb-3">{item.notes}</p>
      )}

      {item.id === 'ca-diversity' && (
        <p className="text-sm text-muted-foreground mb-3">
          <a href="https://www.fipvcc.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">FIPVCC</a>{' '}{t('detail.fipvccDescription')}
        </p>
      )}

      <div className="text-sm text-muted-foreground mb-3 space-y-0.5">
        <p><strong>{t('detail.deadline')}:</strong> {item.deadline_description}</p>
        <p><strong>{t('detail.filingSystem')}:</strong> {item.filing_system}</p>
        <p><strong>{t('detail.appliesTo')}:</strong> {item.applicability_text}</p>
      </div>

      {links && links.length > 0 && (
        <div className="mb-3 space-y-1">
          {links.map(link => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <LinkIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="underline underline-offset-2">{link.title}</span>
              {link.description && <span className="opacity-70">— {link.description}</span>}
            </a>
          ))}
        </div>
      )}

      {/* Complete form (shown when clicking Mark Complete) */}
      {showCompleteForm && (
        <div className="mb-3 rounded border p-3 space-y-2">
          <p className="text-xs font-medium">{t('detail.markAsCompleted')}</p>
          <input
            type="text"
            placeholder={t('detail.notePlaceholder')}
            value={completeNote}
            onChange={e => setCompleteNote(e.target.value)}
            className="w-full text-sm px-2 py-1.5 rounded border bg-background"
          />
          <input
            type="url"
            placeholder={t('detail.linkPlaceholder')}
            value={completeLink}
            onChange={e => setCompleteLink(e.target.value)}
            className="w-full text-sm px-2 py-1.5 rounded border bg-background"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                onMarkComplete(item.id, true, completeNote || undefined, completeLink || undefined, group)
                setShowCompleteForm(false)
              }}
            >
              {t('detail.complete')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCompleteForm(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {item.regulation_url && (
          <a
            href={item.regulation_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />{t('detail.viewRegulation')}
          </a>
        )}
        {item.filing_portal_url && (
          <a
            href={item.filing_portal_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />{t('detail.filingPortal')}
          </a>
        )}
        <span className="flex-1" />
        {isCompleted ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setShowCompleteForm(true)}
            >
              {t('common.edit')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={() => onMarkComplete(item.id, false, undefined, undefined, group)}
            >
              {t('detail.restore')}
            </Button>
          </>
        ) : isDismissed ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setShowCompleteForm(true)}
            >
              {t('detail.markComplete')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={() => onToggleDismiss(item.id, false, undefined, group)}
            >
              {t('detail.restore')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setShowCompleteForm(true)}
            >
              {t('detail.markComplete')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={() => onToggleDismiss(item.id, true, 'Manually dismissed', group)}
            >
              {t('detail.dismiss')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
