import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Investments.metadata')
  return { title: t('title') }
}

export default function InvestmentsLayout({ children }: { children: React.ReactNode }) {
  return children
}
