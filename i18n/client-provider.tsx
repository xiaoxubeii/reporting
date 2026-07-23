'use client'

import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { reportTranslationError, translationFallback } from './runtime'
import type { Locale } from './locales'

export function I18nClientProvider({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode
  locale: Locale
  messages: AbstractIntlMessages
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      onError={reportTranslationError}
      getMessageFallback={translationFallback}
    >
      {children}
    </NextIntlClientProvider>
  )
}
