import { Send } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.asks' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function AsksExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Send}
      screenshotSrc="/screenshots/asks.png"
    />
  )
}
