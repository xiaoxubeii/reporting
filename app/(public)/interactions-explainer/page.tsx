import { Handshake } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.interactions' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function InteractionsExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Handshake}
      screenshotSrc="/screenshots/interactions.png"
    />
  )
}
