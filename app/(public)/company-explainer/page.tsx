import { Building2 } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.company' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function CompanyExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Building2}
      screenshotSrc="/screenshots/company.png"
    />
  )
}
