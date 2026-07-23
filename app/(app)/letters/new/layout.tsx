import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Letters.new')
  return { title: t('metadataTitle') }
}

export default function NewLetterLayout({ children }: { children: React.ReactNode }) {
  return children
}
