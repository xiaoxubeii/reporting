import type { Metadata } from 'next'
import Script from 'next/script'
import { Hanken_Grotesk, Plus_Jakarta_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { I18nClientProvider } from '@/i18n/client-provider'
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/locales'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/toaster'
import { ConfirmProvider } from '@/components/confirm-dialog'
import './globals.css'

// Curated UI font options. Loaded as CSS variables so the per-fund theme can
// opt in via --font-sans; the default (--font-sans unset) falls back to the
// system stack, so the app looks unchanged out of the box.
const hankenGrotesk = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' })
const plusJakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' })

const ogImageUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://portfolio.hemrock.com'}/api/og?title=Portfolio+Reporting`

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Metadata')
  return {
    title: {
      template: t('titleTemplate'),
      default: t('titleDefault'),
    },
    description: t('description'),
    openGraph: {
      title: t('socialTitle'),
      description: t('description'),
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      type: 'website',
      siteName: t('siteName'),
    },
    twitter: {
      card: 'summary_large_image',
      title: t('socialTitle'),
      description: t('description'),
      images: [ogImageUrl],
    },
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])
  const resolvedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE

  return (
    <html lang={resolvedLocale} suppressHydrationWarning className={`${hankenGrotesk.variable} ${plusJakarta.variable}`}>
      <body className="font-sans">
        <I18nClientProvider locale={resolvedLocale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="portfolio-theme"
          >
            <ConfirmProvider>
              {children}
            </ConfirmProvider>
            <Toaster />
          </ThemeProvider>
        </I18nClientProvider>
        <Analytics />
        <SpeedInsights />
        {/* Unregister any stale service workers from prior deployments */}
        <Script id="sw-cleanup" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(regs) {
              regs.forEach(function(r) { r.unregister(); });
            });
          }
        `}</Script>
      </body>
    </html>
  )
}
