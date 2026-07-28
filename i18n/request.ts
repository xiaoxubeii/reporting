import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { LOCALE_COOKIE_NAME, resolveLocale } from './locales'
import { loadMessages } from './messages'
import { reportTranslationError, translationFallback } from './runtime'
import { resolveTimeZone, TIME_ZONE_COOKIE_NAME } from './time-zone'

export default getRequestConfig(async () => {
  const requestCookies = cookies()
  const locale = resolveLocale({
    cookieLocale: requestCookies.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: headers().get('accept-language'),
  })
  const { timeZone } = resolveTimeZone(
    requestCookies.get(TIME_ZONE_COOKIE_NAME)?.value,
  )

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone,
    onError: reportTranslationError,
    getMessageFallback: translationFallback,
  }
})
