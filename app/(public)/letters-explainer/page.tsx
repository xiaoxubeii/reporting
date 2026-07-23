import { FileText } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.letters' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function LettersExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={FileText}
      screenshotSrc="/screenshots/letters.png"
    />
  )
}
