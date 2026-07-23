import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://portfolio.hemrock.com'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Contact.metadata')
  const title = t('title')
  const description = t('description')

  return {
  title,
  description,
  openGraph: {
    title,
    description,
    images: [{ url: `${BASE_URL}/screenshots/contact.png`, width: 1200, height: 630, alt: title }],
    type: 'website',
    siteName: 'Analyst by Hemrock',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [`${BASE_URL}/screenshots/contact.png`],
  },
  }
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children
}
