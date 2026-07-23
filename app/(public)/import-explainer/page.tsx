import { Upload } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.import' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function ImportExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Upload}
      screenshotSrc="/screenshots/import.png"
    />
  )
}
