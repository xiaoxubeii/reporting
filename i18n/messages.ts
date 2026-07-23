import type { AbstractIntlMessages } from 'next-intl'
import englishMessages from '../messages/en.json'
import simplifiedChineseMessages from '../messages/zh-CN.json'
import { isSupportedLocale, type Locale } from './locales'

type MessageLoader = () => Promise<AbstractIntlMessages>

export const MESSAGE_LOADERS = Object.freeze({
  en: async () => englishMessages,
  'zh-CN': async () => simplifiedChineseMessages,
} satisfies Record<Locale, MessageLoader>)

export async function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  if (!isSupportedLocale(locale)) {
    throw new Error('Unsupported locale')
  }

  return MESSAGE_LOADERS[locale]()
}
