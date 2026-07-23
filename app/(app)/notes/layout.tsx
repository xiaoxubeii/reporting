import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Notes.metadata')
  return { title: t('title') }
}

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return children
}
