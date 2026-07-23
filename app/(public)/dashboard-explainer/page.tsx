import { Building2 } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedDashboardExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.dashboard' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function DashboardExplainerPage() {
  return (
    <LocalizedDashboardExplainerContent
      icon={Building2}
      screenshotSrc="/screenshots/dashboard.png"
      secondaryScreenshotSrc="/screenshots/company.png"
    />
  )
}
