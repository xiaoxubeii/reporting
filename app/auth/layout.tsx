import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LanguageSwitcher } from '@/components/language-switcher'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth')
  return { title: t('signIn') }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="fixed right-4 top-4 z-50 rounded-md border bg-background/95 shadow-sm backdrop-blur">
        <LanguageSwitcher className="w-36" />
      </div>
      {children}
    </div>
  )
}
