import { Lock } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.lpPortal' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function LpPortalExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Lock}
      screenshotSrc="/screenshots/lp-portal.png"
    />
  )
}
