import { Crown } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.lps' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function LPsExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Crown}
      screenshotSrc="/screenshots/lps.png"
    />
  )
}
