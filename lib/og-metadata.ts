import type { Metadata } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://portfolio.hemrock.com'

export function ogMetadata(opts: {
  title: string
  description: string
  subtitle?: string
  baseUrl?: string
  siteName?: string
  brand?: string
  siteLabel?: string
}): Metadata {
  const ogUrl = new URL('/api/og', opts.baseUrl ?? BASE_URL)
  ogUrl.searchParams.set('title', opts.title)
  if (opts.subtitle) ogUrl.searchParams.set('subtitle', opts.subtitle)
  if (opts.brand) ogUrl.searchParams.set('brand', opts.brand)
  if (opts.siteLabel) ogUrl.searchParams.set('site', opts.siteLabel)

  return {
    title: opts.title,
    description: opts.description,
    openGraph: {
      title: opts.title,
      description: opts.description,
      images: [{ url: ogUrl.toString(), width: 1200, height: 630, alt: opts.title }],
      type: 'website',
      siteName: opts.siteName ?? 'Analyst by Hemrock',
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
      images: [ogUrl.toString()],
    },
  }
}
