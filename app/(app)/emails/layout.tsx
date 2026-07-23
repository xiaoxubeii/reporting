import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Emails.metadata')
  return { title: t('title'), description: t('description') }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
