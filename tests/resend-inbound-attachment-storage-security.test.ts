import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync(
  new URL(
    '../supabase/migrations/20260726040000_fund_email_inbound_attachments.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('Fund email inbound attachment storage security', () => {
  it('creates a dedicated private bucket without authenticated object policies', () => {
    expect(SQL).toMatch(/fund-email-inbound-attachments/i)
    expect(SQL).toMatch(/false/i)
    expect(SQL).toMatch(/10485760/)
    expect(SQL).not.toMatch(/create\s+policy/i)
    expect(SQL).not.toMatch(/authenticated|anon/i)
  })
})
