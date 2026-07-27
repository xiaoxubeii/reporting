'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Building2, CheckCircle2, Loader2, Mail, ShieldCheck, XCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

const SESSION_KEY = 'fundworkspace:fund-invitation-token'

interface InvitationPreview {
  fundName: string
  fundSlug: string
  emailMasked: string
  role: 'admin' | 'member'
  expiresAt: string
}

type ViewState = 'loading' | 'ready' | 'invalid' | 'accepting' | 'accepted' | 'declined'

export default function FundInvitationPage() {
  const t = useTranslations('FundInvitation')
  const [state, setState] = useState<ViewState>('loading')
  const [token, setToken] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [canonicalOrigin, setCanonicalOrigin] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get('token')
    if (fragmentToken) sessionStorage.setItem(SESSION_KEY, fragmentToken)
    if (window.location.hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    const rawToken = fragmentToken || sessionStorage.getItem(SESSION_KEY)
    if (!rawToken) {
      setState('invalid')
      return
    }
    setToken(rawToken)

    void Promise.all([
      createClient().auth.getUser(),
      fetch('/api/public/fund-invitations/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ token: rawToken }),
      }),
    ]).then(async ([userResult, response]) => {
      if (!active) return
      setAuthenticated(Boolean(userResult.data.user))
      const body = await response.json()
      if (!response.ok || !body.invitation) {
        clearToken()
        setState('invalid')
        return
      }
      setInvitation(body.invitation)
      setState('ready')
    }).catch(() => {
      if (active) setState('invalid')
    })
    return () => { active = false }
  }, [])

  function clearToken() {
    sessionStorage.removeItem(SESSION_KEY)
    setToken(null)
  }

  function decline() {
    clearToken()
    setState('declined')
  }

  async function accept() {
    if (!token) return
    if (!authenticated) {
      window.location.assign('/auth?next=%2Finvite')
      return
    }
    setState('accepting')
    setError(null)
    try {
      const response = await fetch('/api/fund-invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const body = await response.json()
      if (!response.ok) {
        if (response.status === 404 || body.code === 'invitation_unavailable') clearToken()
        setError(body.error || t('errors.generic'))
        setState(response.status === 404 ? 'invalid' : 'ready')
        return
      }
      clearToken()
      setCanonicalOrigin(body.canonicalOrigin)
      setState('accepted')
    } catch {
      setError(t('errors.generic'))
      setState('ready')
    }
  }

  if (state === 'loading') return <CenteredStatus icon={<Loader2 className="h-5 w-5 animate-spin" />} text={t('loading')} />
  if (state === 'invalid') return <TerminalCard icon={<XCircle className="h-6 w-6 text-destructive" />} title={t('invalid.title')} description={t('invalid.description')} />
  if (state === 'declined') return <TerminalCard icon={<XCircle className="h-6 w-6 text-muted-foreground" />} title={t('declined.title')} description={t('declined.description')} />
  if (state === 'accepted') {
    return (
      <main className="min-h-screen bg-muted/30 px-4 py-16">
        <Card className="mx-auto max-w-lg shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <CardTitle>{t('accepted.title')}</CardTitle>
            <CardDescription>{t('accepted.description', { fundName: invitation?.fundName ?? '' })}</CardDescription>
          </CardHeader>
          <CardContent className={`grid gap-3 ${invitation?.role === 'admin' ? 'sm:grid-cols-2' : ''}`}>
            <Button asChild><a href={`${canonicalOrigin ?? ''}/settings/personal`}>{t('accepted.personal')}</a></Button>
            {invitation?.role === 'admin' && <Button variant="outline" asChild><a href={`${canonicalOrigin ?? ''}/funds/setup`}>{t('accepted.setup')}</a></Button>}
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-12 sm:py-16">
      <Card className="mx-auto max-w-xl overflow-hidden shadow-sm">
        <div className="h-1 bg-foreground" />
        <CardHeader>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border bg-muted">
            <Building2 className="h-5 w-5" />
          </div>
          <CardTitle>{t('title', { fundName: invitation?.fundName ?? '' })}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('invitee')}</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium"><Mail className="h-4 w-4" />{invitation?.emailMasked}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('role')}</p>
              <Badge variant="secondary" className="mt-1">{t(`roles.${invitation?.role ?? 'member'}`)}</Badge>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{authenticated ? t('verifiedAccount') : t('signInGuidance')}</p>
          </div>
          <p className="text-xs text-muted-foreground">{t('expires', { date: invitation ? new Date(invitation.expiresAt).toLocaleString() : '' })}</p>
        </CardContent>
        <CardFooter className="flex flex-col-reverse gap-2 border-t bg-muted/20 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={decline} className="w-full sm:w-auto">{t('decline')}</Button>
          <Button onClick={accept} disabled={state === 'accepting'} className="w-full sm:w-auto">
            {state === 'accepting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {authenticated ? t('accept') : t('signIn')}
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}

function CenteredStatus({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-muted/30"><div className="flex items-center gap-3 text-sm text-muted-foreground">{icon}{text}</div></main>
}

function TerminalCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-16">
      <Card className="mx-auto max-w-md text-center shadow-sm">
        <CardHeader>
          <div className="mx-auto mb-2">{icon}</div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  )
}
