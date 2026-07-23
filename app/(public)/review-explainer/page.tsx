import { ClipboardCheck } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.review' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function ReviewExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={ClipboardCheck}
      screenshotSrc="/screenshots/review.png"
    />
  )
}
