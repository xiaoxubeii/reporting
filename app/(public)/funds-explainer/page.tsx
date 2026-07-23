import { Briefcase } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.funds' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function FundsExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Briefcase}
      screenshotSrc="/screenshots/funds.png"
    />
  )
}
