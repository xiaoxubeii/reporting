import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { StandaloneLocaleControl } from '@/components/standalone-locale-control'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('FundInvitation')
  return { title: t('metadata.title'), referrer: 'no-referrer' }
}

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StandaloneLocaleControl />
      {children}
    </>
  )
}
