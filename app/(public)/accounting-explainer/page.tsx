import { Calculator } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.accounting' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function AccountingExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Calculator}
      screenshotSrc="/screenshots/funds.png"
    />
  )
}
