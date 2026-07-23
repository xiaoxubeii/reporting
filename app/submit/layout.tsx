import { StandaloneLocaleControl } from '@/components/standalone-locale-control'

export default function SubmitLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StandaloneLocaleControl />
      {children}
    </>
  )
}
