'use client'

import { useEffect, useRef, useState } from 'react'
import { Globe2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { isSupportedLocale, type Locale } from '@/i18n/locales'
import { localeHashRestoreUrl, type PendingLocaleLocation } from '@/i18n/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface LanguageSwitcherProps {
  className?: string
  compact?: boolean
}

export function LanguageSwitcher({ className, compact = false }: LanguageSwitcherProps) {
  const activeLocale = useLocale()
  const t = useTranslations('Language')
  const router = useRouter()
  const [isChanging, setIsChanging] = useState(false)
  const pendingLocationRef = useRef<PendingLocaleLocation | null>(null)
  const pendingLocaleRef = useRef<Locale | null>(null)
  const locale: Locale = isSupportedLocale(activeLocale) ? activeLocale : 'en'
  const currentLanguage = locale === 'zh-CN' ? t('simplifiedChinese') : t('english')

  useEffect(() => {
    const pendingLocation = pendingLocationRef.current
    if (pendingLocation === null || pendingLocaleRef.current !== locale) return

    pendingLocationRef.current = null
    pendingLocaleRef.current = null

    const restoreUrl = localeHashRestoreUrl(pendingLocation, window.location)
    if (restoreUrl) {
      window.history.replaceState(
        window.history.state,
        '',
        restoreUrl,
      )
    }
  }, [locale])

  async function changeLocale(nextLocale: string) {
    if (!isSupportedLocale(nextLocale) || nextLocale === locale) return

    setIsChanging(true)
    try {
      const response = await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: nextLocale }),
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'error',
      })
      const result: unknown = await response.json()
      if (
        !response.ok ||
        typeof result !== 'object' ||
        result === null ||
        !('locale' in result) ||
        !isSupportedLocale(result.locale) ||
        result.locale !== nextLocale
      ) {
        throw new Error('Locale update failed')
      }
      pendingLocationRef.current = {
        pathAndSearch: `${window.location.pathname}${window.location.search}`,
        hash: window.location.hash,
      }
      pendingLocaleRef.current = nextLocale
      router.refresh()
    } catch {
      toast.error(t('changeError'))
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <Select value={locale} onValueChange={changeLocale} disabled={isChanging}>
      <SelectTrigger
        aria-label={t('labelWithCurrent', { language: currentLanguage })}
        aria-busy={isChanging}
        title={compact ? t('label') : undefined}
        className={cn(
          'h-11 gap-2 border-0 bg-transparent px-3 text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-2 focus:ring-ring',
          compact && 'w-11 justify-center px-0 [&>svg:last-child]:hidden',
          className,
        )}
      >
        <Globe2 className="h-5 w-5 shrink-0" aria-hidden="true" />
        {!compact && (
          <span className="min-w-0 flex-1 truncate text-left text-xs">
            {isChanging ? t('changing') : <SelectValue />}
          </span>
        )}
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value="en">{t('english')}</SelectItem>
        <SelectItem value="zh-CN">{t('simplifiedChinese')}</SelectItem>
      </SelectContent>
    </Select>
  )
}
