'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Users, Mail, ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

interface IntroContact {
  name: string
  email?: string
  context: string
}

interface Interaction {
  id: string
  email_id: string | null
  tags: string[]
  subject: string | null
  summary: string | null
  intro_contacts: IntroContact[] | null
  interaction_date: string
}

export function CompanyInteractions({ companyId, adminOnly }: { companyId: string; adminOnly?: boolean }) {
  const t = useTranslations('CompanyDetail.interactions')
  const format = useFormatter()
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [emailExpandedId, setEmailExpandedId] = useState<string | null>(null)
  const [fetchedBodies, setFetchedBodies] = useState<Record<string, string>>({})
  const [emailLoading, setEmailLoading] = useState<string | null>(null)

  const toggleEmailBody = async (interactionId: string, emailId: string) => {
    if (emailExpandedId === interactionId) {
      setEmailExpandedId(null)
      return
    }
    setEmailExpandedId(interactionId)
    if (fetchedBodies[emailId]) return
    setEmailLoading(interactionId)
    try {
      const res = await fetch(`/api/emails/${emailId}`)
      const data = await res.json()
      const payload = data.raw_payload ?? {}
      const body = payload.TextBody || payload.HtmlBody || ''
      setFetchedBodies(prev => ({ ...prev, [emailId]: body }))
    } catch {
      setFetchedBodies(prev => ({ ...prev, [emailId]: t('emailLoadFailed') }))
    } finally {
      setEmailLoading(null)
    }
  }

  useEffect(() => {
    fetch(`/api/companies/${companyId}/interactions?limit=5`)
      .then(res => res.json())
      .then(data => {
        setInteractions(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [companyId])

  function formatRelativeTime(dateStr: string) {
    const date = new Date(dateStr)
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)

    if (diffMin < 1) return t('relative.justNow')
    if (diffMin < 60) return t('relative.minutes', { count: diffMin })
    if (diffHr < 24) return t('relative.hours', { count: diffHr })
    if (diffDay < 7) return t('relative.days', { count: diffDay })
    return format.dateTime(date, { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="mt-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">{t('title')}{adminOnly && <Lock className="h-3 w-3 text-amber-500" />}</h2>
        <p className="text-xs text-muted-foreground">{t('loading')}</p>
      </div>
    )
  }

  if (interactions.length === 0) return null

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">{t('title')}{adminOnly && <Lock className="h-3 w-3 text-amber-500" />}</h2>
        <Link
          href={`/interactions?company_id=${companyId}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t('viewAll')}
        </Link>
      </div>

      <div className="space-y-1.5">
        {interactions.map(interaction => {
          const introContacts = interaction.intro_contacts ?? []
          const isExpanded = expandedId === interaction.id
          const hasIntros = introContacts.length > 0

          return (
            <div
              key={interaction.id}
              className={`border rounded-md p-2.5 text-sm ${
                interaction.tags?.includes('intro')
                  ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {interaction.tags?.includes('intro') ? (
                  <Users className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Mail className="h-3 w-3" />
                )}
                <span>{formatRelativeTime(interaction.interaction_date)}</span>
                {interaction.tags?.includes('intro') && (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">{t('intro')}</span>
                )}
              </div>

              {interaction.subject && (
                <p className="font-medium mt-0.5 truncate">{interaction.subject}</p>
              )}

              {interaction.summary && (
                <p className="text-muted-foreground mt-0.5 line-clamp-2">{interaction.summary}</p>
              )}

              {hasIntros && (
                <>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : interaction.id)}
                    className="flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {t('contactsIntroduced', { count: introContacts.length })}
                  </button>

                  {isExpanded && (
                    <div className="mt-1.5 pl-3 border-l-2 border-amber-200 dark:border-amber-800 space-y-1">
                      {introContacts.map((contact, idx) => (
                        <div key={idx} className="text-xs">
                          <span className="font-medium">{contact.name}</span>
                          {contact.context && (
                            <span className="text-muted-foreground">, {contact.context}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Expandable email body */}
              {interaction.email_id && (
                <button
                  onClick={() => toggleEmailBody(interaction.id, interaction.email_id!)}
                  className="flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {emailExpandedId === interaction.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Mail className="h-3 w-3" />
                  {t('viewEmail')}
                </button>
              )}

              {emailExpandedId === interaction.id && interaction.email_id && (
                <div className="mt-1.5 border rounded-md bg-muted/30 p-3">
                  {emailLoading === interaction.id ? (
                    <p className="text-xs text-muted-foreground animate-pulse">{t('loadingEmail')}</p>
                  ) : (
                    <pre className="text-xs whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                      {fetchedBodies[interaction.email_id] || ''}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
