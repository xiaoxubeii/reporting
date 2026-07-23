import type { Locale } from './locales'

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    // The complete product catalog now exceeds 5,000 leaf messages. Expanding
    // every key into a TypeScript union causes excessive-depth failures in
    // otherwise valid pages. Catalog parity, ICU signatures, namespace wiring,
    // and authored UI literals are enforced by the localization test suite.
  }
}
