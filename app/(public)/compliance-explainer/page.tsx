import { ShieldCheck } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.compliance' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function ComplianceExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={ShieldCheck}
      screenshotSrc="/screenshots/compliance.png"
    />
  )
}
