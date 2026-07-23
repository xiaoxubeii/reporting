import { StickyNote } from 'lucide-react'
import {
  generateExplainerMetadata,
  LocalizedExplainerContent,
} from '../explainer-content'

const namespace = 'PublicExplainers.notes' as const

export function generateMetadata() {
  return generateExplainerMetadata(namespace)
}

export default function NotesExplainerPage() {
  return (
    <LocalizedExplainerContent
      namespace={namespace}
      icon={StickyNote}
      screenshotSrc="/screenshots/notes.png"
    />
  )
}
