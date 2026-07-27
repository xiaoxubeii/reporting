'use client'

import { createContext, useContext } from 'react'

export interface TenantBranding {
  readonly slug: string
  readonly name: string
  readonly logoUrl: string | null
}

const TenantBrandingContext = createContext<TenantBranding | null>(null)

export function TenantBrandingProvider({
  value,
  children,
}: {
  readonly value: TenantBranding | null
  readonly children: React.ReactNode
}) {
  return (
    <TenantBrandingContext.Provider value={value}>
      {children}
    </TenantBrandingContext.Provider>
  )
}

export function useTenantBranding(): TenantBranding | null {
  return useContext(TenantBrandingContext)
}
