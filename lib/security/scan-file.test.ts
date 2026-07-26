import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { scanFileAsync } from './scan-file'

const CORRUPT_ZIP = Buffer.from([
  0x50, 0x4b, 0x03, 0x04,
  0x74, 0x68, 0x69, 0x73, 0x2d, 0x69, 0x73, 0x2d, 0x6e, 0x6f, 0x74, 0x2d, 0x61, 0x2d, 0x7a, 0x69, 0x70,
])

describe('scanFileAsync ZIP integrity boundary', () => {
  it.each([
    ['archive.zip', 'application/zip'],
    ['report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['model.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ])('fails closed when %s has ZIP magic bytes but is corrupt', async (filename, contentType) => {
    await expect(scanFileAsync(CORRUPT_ZIP, filename, contentType)).resolves.toEqual({
      safe: false,
      reason: 'ZIP archive is invalid or corrupted',
    })
  })

  it('fails closed for empty ZIP-based files', async () => {
    await expect(scanFileAsync(Buffer.alloc(0), 'empty.zip', 'application/zip'))
      .resolves.toEqual({ safe: false, reason: 'ZIP archive is invalid or corrupted' })
  })

  it('rejects a valid ZIP renamed as OOXML when required package entries are missing', async () => {
    const plainZip = await new JSZip()
      .file('safe.txt', 'safe')
      .generateAsync({ type: 'nodebuffer' })

    await expect(scanFileAsync(
      plainZip,
      'report.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )).resolves.toEqual({
      safe: false,
      reason: 'OOXML package is invalid or corrupted',
    })
    await expect(scanFileAsync(plainZip, 'archive.zip', 'application/zip'))
      .resolves.toEqual({ safe: true })
  })

  it('accepts a structurally valid bounded OOXML package', async () => {
    const docx = await new JSZip()
      .file('[Content_Types].xml', '<Types/>')
      .file('word/document.xml', '<document/>')
      .generateAsync({ type: 'nodebuffer' })

    await expect(scanFileAsync(
      docx,
      'report.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )).resolves.toEqual({ safe: true })
  })
})
