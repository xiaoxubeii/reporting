import type { Metadata } from 'next'
import { Hanken_Grotesk, Plus_Jakarta_Sans } from 'next/font/google'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { I18nClientProvider } from '@/i18n/client-provider'
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/locales'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/toaster'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getTrustedRequestTenant, trustedTenantSlugFromHeaders } from '@/lib/tenancy/request'
import { themeCssVars, type FundTheme } from '@/lib/theme'
import { TenantBrandingProvider } from '@/components/tenant-branding-provider'
import { PlatformTelemetry } from '@/components/platform-telemetry'
import { isPlatformTelemetryEnabled } from '@/lib/platform-telemetry'
import { ServiceWorkerCleanup } from '@/components/service-worker-cleanup'
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
  const telemetryEnabled = isPlatformTelemetryEnabled(process.env)
  const requestHeaders = new Headers(headers())
  const tenantSlug = trustedTenantSlugFromHeaders(requestHeaders)
  const [locale, messages, tenant] = await Promise.all([
    getLocale(),
    getMessages(),
    tenantSlug
      ? getTrustedRequestTenant(createClient() as never, requestHeaders)
      : Promise.resolve(null),
  ])
  const resolvedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
  const tenantTheme = themeCssVars((tenant?.theme ?? null) as FundTheme | null)
  const tenantBranding = tenant
    ? { slug: tenant.slug, name: tenant.name, logoUrl: tenant.logoUrl }
    : null

  return (
    <html lang={resolvedLocale} suppressHydrationWarning className={`${hankenGrotesk.variable} ${plusJakarta.variable}`}>
      <body className="font-sans">
        {tenantTheme && <style dangerouslySetInnerHTML={{ __html: `:root{${tenantTheme}}` }} />}
        <I18nClientProvider locale={resolvedLocale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="portfolio-theme"
          >
            <ConfirmProvider>
              <TenantBrandingProvider value={tenantBranding}>
                {children}
              </TenantBrandingProvider>
            </ConfirmProvider>
            <Toaster />
          </ThemeProvider>
        </I18nClientProvider>
        <PlatformTelemetry enabled={telemetryEnabled} />
        <ServiceWorkerCleanup />
      </body>
    </html>
  )
}
