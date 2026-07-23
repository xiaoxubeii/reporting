import { Mail } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.inbound' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function InboundExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Mail}
      screenshotSrc="/screenshots/inbound.png"
    />
  )
}
