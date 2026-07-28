import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const detailSource = readFileSync(
  path.join(process.cwd(), 'app/(app)/diligence/[id]/deal-detail.tsx'),
  'utf8',
)

const dataRoom = detailSource.slice(
  detailSource.indexOf('function DealRoomTab('),
  detailSource.indexOf('\nfunction ', detailSource.indexOf('function DealRoomTab(') + 1),
)

describe('data room primary file actions', () => {
  it('uses the same typography, height, padding, gap, and icon size for upload and Drive import', () => {
    expect(dataRoom).toContain('inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-card px-4 text-sm font-medium')
    expect(dataRoom).toContain('<Upload className="h-4 w-4" />')
    expect(dataRoom).toContain('<Button variant="outline" className="h-10 px-4 text-sm font-medium" onClick={() => setDriveOpen(true)}>')
    expect(dataRoom).toContain('<FolderInput className="h-4 w-4" />')
  })

  it('preserves the existing upload and Drive import behaviors', () => {
    expect(dataRoom).toContain('onChange={e => handleFiles(e.target.files)}')
    expect(dataRoom).toContain("{uploading ? t('uploading') : t('upload')}")
    expect(dataRoom).toContain("{t('drive.import')}")
    expect(dataRoom).toContain('onClick={() => setDriveOpen(true)}')
  })
})
