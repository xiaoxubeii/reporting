'use client'

import { usePathname } from 'next/navigation'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { useTenantBranding } from '@/components/tenant-branding-provider'

export function PlatformTelemetry() {
  const pathname = usePathname()
  const tenant = useTenantBranding()
  if (tenant && pathname === '/') return null
  return <><Analytics /><SpeedInsights /></>
}
