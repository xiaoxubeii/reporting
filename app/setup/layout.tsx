import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { StandaloneLocaleControl } from '@/components/standalone-locale-control'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Setup')

  return { title: t('metadata.title') }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StandaloneLocaleControl />
      {children}
    </>
  )
}
