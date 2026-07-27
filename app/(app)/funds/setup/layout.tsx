import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('FundSetup')
  return { title: t('metadata.title') }
}

export default function FundSetupLayout({ children }: { children: React.ReactNode }) {
  return children
}
