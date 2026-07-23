import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Compliance')

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
  }
}

export default function ComplianceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
