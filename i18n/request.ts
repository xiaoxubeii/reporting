import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { LOCALE_COOKIE_NAME, resolveLocale } from './locales'
import { loadMessages } from './messages'
import { reportTranslationError, translationFallback } from './runtime'

export default getRequestConfig(async () => {
  const locale = resolveLocale({
    cookieLocale: cookies().get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: headers().get('accept-language'),
  })

  return {
    locale,
    messages: await loadMessages(locale),
    onError: reportTranslationError,
    getMessageFallback: translationFallback,
  }
})
