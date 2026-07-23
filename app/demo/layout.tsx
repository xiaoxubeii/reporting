import { getTranslations } from 'next-intl/server'
import { StandaloneLocaleControl } from '@/components/standalone-locale-control'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('Demo')
  return { title: t('metadataTitle') }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StandaloneLocaleControl />
      {children}
    </>
  )
}
