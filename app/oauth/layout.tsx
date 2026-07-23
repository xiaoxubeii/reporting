import { StandaloneLocaleControl } from '@/components/standalone-locale-control'

export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StandaloneLocaleControl />
      {children}
    </>
  )
}
