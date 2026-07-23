import { Lightbulb } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.deals' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function DealsExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Lightbulb}
      screenshotSrc="/screenshots/deals.png"
    />
  )
}
