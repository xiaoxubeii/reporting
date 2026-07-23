import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function NotFound() {
  const t = await getTranslations('NotFound')
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center">
        <p className="text-7xl font-semibold tracking-tight mb-2">404</p>
        <p className="text-lg text-muted-foreground mb-6">{t('description')}</p>
        <Link
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t('backHome')}
        </Link>
      </div>
    </div>
  )
}
