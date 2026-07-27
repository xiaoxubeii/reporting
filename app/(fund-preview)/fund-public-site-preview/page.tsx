import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { NextResponse } from 'next/server'
import { FundPublicSite } from '@/components/fund-public-site/fund-public-site'
import { requireFundPublicSiteAdmin } from '@/lib/fund-public-site/admin'
import { getOrCreateFundPublicSiteDraft } from '@/lib/fund-public-site/store'
import type { FundPublicSiteLocale } from '@/lib/fund-public-site/content'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Fund site preview',
  robots: { index: false, follow: false },
}

export default async function FundPublicSitePreviewPage({
  searchParams,
}: {
  searchParams: { locale?: string }
}) {
  const requestHeaders = headers()
  const context = await requireFundPublicSiteAdmin({ headers: requestHeaders })
  if (context instanceof NextResponse) notFound()

  const site = await getOrCreateFundPublicSiteDraft(
    context.admin,
    context.fundId,
    context.fundName,
    context.userId,
  )
  const locale: FundPublicSiteLocale = searchParams.locale === 'zh-CN' ? 'zh-CN' : 'en'

  return (
    <FundPublicSite
      fundName={context.fundName}
      logoUrl={context.logoUrl}
      templateKey={site.templateKey}
      content={site.content}
      locale={locale}
      preview
    />
  )
}
