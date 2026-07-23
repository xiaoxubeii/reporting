import { ogMetadata } from '@/lib/og-metadata'
import Link from 'next/link'
import { Tag, Github, Heart, Calendar, Send } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { CalendlyButton } from '@/components/calendly-button'
import { SubscriptionInquiryButton } from '@/components/subscription-inquiry-modal'

export async function generateMetadata() {
  const t = await getTranslations('Pricing.metadata')
  return ogMetadata({ title: t('title'), description: t('description') })
}

export default async function PricingPage() {
  const t = await getTranslations('Pricing')

  return (
    <div className="p-4 pt-6 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-6 flex items-center gap-3">
        <Tag className="h-6 w-6 text-muted-foreground" />
        {t('title')}
      </h1>

      <div className="space-y-8 text-sm leading-relaxed">
        <p className="text-muted-foreground">
          {t.rich('intro', {
            license: chunks => <Link href="/license" className="text-foreground underline underline-offset-4 hover:text-foreground/80">{chunks}</Link>,
          })}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border-2 border-foreground p-6 flex flex-col relative">
            <span className="absolute -top-3 left-4 bg-foreground text-background text-xs font-medium px-2.5 py-0.5 rounded-full">{t('plans.selfHosted.badge')}</span>
            <h3 className="font-semibold mb-1">{t('plans.selfHosted.title')}</h3>
            <p className="text-2xl font-bold mb-1">{t('plans.selfHosted.price')}</p>
            <p className="text-xs text-muted-foreground mb-3">{t('plans.selfHosted.subtitle')}</p>
            <ul className="text-sm text-muted-foreground space-y-1.5 mb-4 flex-1">
              {(['1', '2', '3', '4', '5'] as const).map(item => <li key={item}>{t(`plans.selfHosted.features.${item}`)}</li>)}
            </ul>
            <Button size="sm" asChild className="w-full">
              <a href="https://github.com/tdavidson/reporting" className="gap-2">
                <Github className="h-4 w-4" />
                {t('plans.selfHosted.action')}
              </a>
            </Button>
          </div>

          <div className="rounded-lg border p-6 flex flex-col">
            <h3 className="font-semibold mb-1">{t('plans.support.title')}</h3>
            <p className="text-2xl font-bold mb-1">{t('plans.support.price')}</p>
            <p className="text-xs text-muted-foreground mb-3">{t('plans.support.subtitle')}</p>
            <ul className="text-sm text-muted-foreground space-y-1.5 mb-4 flex-1">
              {(['1', '2', '3', '4'] as const).map(item => <li key={item}>{t(`plans.support.features.${item}`)}</li>)}
            </ul>
            <CalendlyButton url="https://calendly.com/foresighthq/15min" className="w-full">
              <Calendar className="h-4 w-4 mr-1.5" />
              {t('plans.support.action')}
            </CalendlyButton>
          </div>

          <div className="rounded-lg border p-6 flex flex-col relative">
            <span className="absolute -top-3 left-4 bg-muted text-muted-foreground text-xs font-medium px-2.5 py-0.5 rounded-full">{t('plans.hosted.badge')}</span>
            <h3 className="font-semibold mb-1">{t('plans.hosted.title')}</h3>
            <p className="text-2xl font-bold mb-1">{t('plans.hosted.price')}</p>
            <p className="text-xs text-muted-foreground mb-3">{t('plans.hosted.subtitle')}</p>
            <ul className="text-sm text-muted-foreground space-y-1.5 mb-4 flex-1">
              {(['1', '2', '3', '4'] as const).map(item => <li key={item}>{t(`plans.hosted.features.${item}`)}</li>)}
            </ul>
            <SubscriptionInquiryButton variant="outline" size="sm" className="w-full">
              <Send className="h-3.5 w-3.5 mr-1.5" />{t('plans.hosted.action')}
            </SubscriptionInquiryButton>
          </div>
        </div>

        <div className="max-w-3xl">
          <h2 className="text-base font-medium mb-2">{t('costs.title')}</h2>
          <p className="text-muted-foreground mb-4">{t('costs.accounts')}</p>
          <p className="text-muted-foreground mb-4">{t('costs.providers')}</p>
          <p className="text-muted-foreground">
            {t.rich('costs.support', {
              taylor: chunks => <a href="https://www.hemrock.com" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4 hover:text-foreground/80">{chunks}</a>,
              contact: chunks => <Link href="/contact" className="text-foreground underline underline-offset-4 hover:text-foreground/80">{chunks}</Link>,
            })}
          </p>
        </div>

        <div className="max-w-3xl rounded-lg border bg-muted/50 p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-base text-muted-foreground flex-1">{t('sponsor.body')}</p>
          <Button variant="outline" size="sm" asChild className="shrink-0 gap-2">
            <a href="https://github.com/sponsors/tdavidson" target="_blank" rel="noopener noreferrer">
              <Heart className="h-4 w-4 text-pink-500" />
              {t('sponsor.action')}
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
