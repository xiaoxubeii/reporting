import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Letters')
  return { title: t('metadataTitle') }
}

export default function LettersLayout({ children }: { children: React.ReactNode }) {
  return children
}
