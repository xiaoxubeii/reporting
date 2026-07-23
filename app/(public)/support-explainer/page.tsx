import { LifeBuoy } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.support' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function SupportExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={LifeBuoy}
    />
  )
}
