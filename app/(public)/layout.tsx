import { headers } from 'next/headers'
import PublicLayoutClient from './public-layout-client'
import { classifyFundHost } from '@/lib/tenancy/host'

export default function PublicLayout({ children }: { readonly children: React.ReactNode }) {
  const requestHeaders = new Headers(headers())
  const hostContext = classifyFundHost(requestHeaders.get('host') ?? '')

  return (
    <PublicLayoutClient hostContext={hostContext}>
      {children}
    </PublicLayoutClient>
  )
}
