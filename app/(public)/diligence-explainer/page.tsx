import { Microscope } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.diligence' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function DiligenceExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Microscope}
      screenshotSrc="/screenshots/diligence.png"
    />
  )
}
