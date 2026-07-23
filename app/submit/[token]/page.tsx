import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SubmitForm } from './submit-form'

type IntakeSettings = {
  fund_id: string
  deal_intake_enabled: boolean
  deal_submission_token: string | null
}

type SubmissionFund = {
  name: string
  logo_url: string | null
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Submit')
  return { title: t('metadata.title') }
}

export default async function SubmitPage({ params }: { params: { token: string } }) {
  const t = await getTranslations('Submit')
  const admin = createAdminClient()
  const { data: settings } = await admin
    .from('fund_settings')
    .select('fund_id, deal_intake_enabled, deal_submission_token')
    .eq('deal_submission_token', params.token)
    .maybeSingle()

  const intakeSettings = settings as IntakeSettings | null
  if (!intakeSettings?.deal_intake_enabled) notFound()

  const { data: fund } = await admin
    .from('funds')
    .select('name, logo_url')
    .eq('id', intakeSettings.fund_id)
    .maybeSingle()

  const submissionFund = fund as SubmissionFund | null
  const fundName = submissionFund?.name ?? t('fundFallback')
  const fundLogo = submissionFund?.logo_url ?? null

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          {fundLogo && <img src={fundLogo} alt={fundName} className="h-12 mx-auto mb-4" />}
          <h1 className="text-2xl font-semibold tracking-tight">{t('title', { fundName })}</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            {t('description')}
          </p>
        </div>
        <SubmitForm token={params.token} fundName={fundName} />
      </div>
    </div>
  )
}
