import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const detail = readFileSync(path.join(root, 'app/(app)/diligence/[id]/deal-detail.tsx'), 'utf8')
const stageHeader = readFileSync(path.join(root, 'components/diligence/stage-header.tsx'), 'utf8')
const notesPanel = detail.slice(detail.indexOf('function NotesPanel('), detail.indexOf('// Settings tab'))

describe('diligence research notes layout', () => {
  it('keeps notes collapsed inside the Research stage header by default', () => {
    expect(detail).toContain('const [notesOpen, setNotesOpen] = useState(false)')
    expect(detail).toContain('aria-expanded={notesOpen}')
    expect(detail).toContain('secondaryAction={')
    expect(detail).not.toContain("<Section title={t('notes.title')}")
  })

  it('uses a compact empty state instead of a large nested card', () => {
    expect(detail).toContain('hidden={!notesOpen}')
    expect(detail).toContain('onCountChange={setNoteCount}')
    expect(notesPanel).not.toContain('rounded-md border bg-card p-8 text-center text-sm text-muted-foreground')
  })

  it('supports a secondary action without changing stage execution controls', () => {
    expect(stageHeader).toContain('secondaryAction?: React.ReactNode')
    expect(stageHeader).toContain('{secondaryAction}')
  })
})
