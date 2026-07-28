'use client'

import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { TimeZoneBootstrap } from '@/components/time-zone-bootstrap'
import { reportTranslationError, translationFallback } from './runtime'
import type { Locale } from './locales'
import type { ResolvedTimeZone } from './time-zone'

export function I18nClientProvider({
  children,
  locale,
  messages,
  timeZone,
  timeZoneSource,
}: {
  children: React.ReactNode
  locale: Locale
  messages: AbstractIntlMessages
  timeZone: string
  timeZoneSource: ResolvedTimeZone['source']
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={timeZone}
      onError={reportTranslationError}
      getMessageFallback={translationFallback}
    >
      <TimeZoneBootstrap
        timeZone={timeZone}
        timeZoneSource={timeZoneSource}
      />
      {children}
    </NextIntlClientProvider>
  )
}
