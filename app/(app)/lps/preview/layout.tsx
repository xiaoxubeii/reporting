import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('LPs.preview')
  return { title: t('metadataTitle') }
}

export default function LpPreviewLayout({ children }: { children: React.ReactNode }) {
  return children
}
