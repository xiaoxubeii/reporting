import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Letters.editor')
  return { title: t('metadataTitle') }
}

export default function LetterEditorLayout({ children }: { children: React.ReactNode }) {
  return children
}
