import { Settings } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.settings' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function SettingsExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={Settings}
      screenshotSrc="/screenshots/settings.png"
    />
  )
}
