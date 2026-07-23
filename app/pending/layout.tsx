import { StandaloneLocaleControl } from '@/components/standalone-locale-control'

export default function PendingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StandaloneLocaleControl />
      {children}
    </>
  )
}
