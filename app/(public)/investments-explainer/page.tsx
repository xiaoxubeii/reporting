import { BarChart3 } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.investments' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function InvestmentsExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={BarChart3}
      screenshotSrc="/screenshots/investments.png"
    />
  )
}
