import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manualRoute = readFileSync(
  new URL('../app/api/deals/manual/route.ts', import.meta.url),
  'utf8',
)
const publicRoute = readFileSync(
  new URL('../app/api/public/submit/[token]/route.ts', import.meta.url),
  'utf8',
)

describe('Deal submission fallback routes', () => {
  it.each([
    ['manual Deal intake', manualRoute],
    ['public Pitch intake', publicRoute],
  ])('%s resolves a null processDeal result through the required fallback', (_name, route) => {
    expect(route).toContain('ensureProcessedDeal')
    expect(route).toContain('usedFallback')
  })

  it('does not let the public Pitch route report success after a failed fallback', () => {
    expect(publicRoute).toMatch(/Fallback Deal insert failed[\s\S]{0,500}status: 500/i)
  })

  it.each([
    ['manual Deal intake', manualRoute],
    ['public Pitch intake', publicRoute],
  ])('%s scans attachments and requires atomic storage before processing', (_name, route) => {
    expect(route).toContain('prepareLegacyInboundAttachments')
    expect(route).toContain('persistPreparedSubmissionAttachments')
    expect(route).toMatch(/attachment_storage_failed[\s\S]{0,800}status: 500/i)
  })

  it('bounds the complete manual multipart body before parsing and returns 413 on overflow', () => {
    expect(manualRoute).toContain('readBoundedFormData(req, MAX_MANUAL_DEAL_BODY_BYTES)')
    expect(manualRoute).toContain('RequestBodyTooLargeError')
    expect(manualRoute).toMatch(/RequestBodyTooLargeError[\s\S]{0,300}status: 413/)
  })
})
