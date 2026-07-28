import { describe, expect, it, vi } from 'vitest'
import { persistPreparedSubmissionAttachments } from './submission-attachments'

const ATTACHMENTS = [
  {
    name: 'pitch.txt',
    contentType: 'text/plain',
    contentLength: 5,
    bytes: Buffer.from('pitch'),
  },
  {
    name: 'model.csv',
    contentType: 'text/csv',
    contentLength: 5,
    bytes: Buffer.from('model'),
  },
]

describe('submission attachment persistence', () => {
  it('publishes metadata only after the complete attachment set is stored', async () => {
    const store = vi.fn(async ({ filename }: { filename: string }) => `email-1/${filename}`)
    const remove = vi.fn(async () => undefined)
    const persistMetadata = vi.fn(async () => undefined)

    const result = await persistPreparedSubmissionAttachments(ATTACHMENTS, {
      store,
      remove,
      persistMetadata,
    })

    expect(result.ok).toBe(true)
    expect(store).toHaveBeenCalledTimes(2)
    expect(persistMetadata).toHaveBeenCalledWith([
      expect.objectContaining({ StoragePath: 'email-1/0_pitch.txt' }),
      expect.objectContaining({ StoragePath: 'email-1/1_model.csv' }),
    ])
    expect(remove).not.toHaveBeenCalled()
  })

  it('rolls back the partial set and refuses metadata when an upload fails', async () => {
    const store = vi.fn()
      .mockResolvedValueOnce('email-1/0_pitch.txt')
      .mockRejectedValueOnce(new Error('storage unavailable'))
    const remove = vi.fn(async () => undefined)
    const persistMetadata = vi.fn(async () => undefined)

    const result = await persistPreparedSubmissionAttachments(ATTACHMENTS, {
      store,
      remove,
      persistMetadata,
    })

    expect(result).toEqual({ ok: false, code: 'attachment_storage_failed' })
    expect(remove).toHaveBeenCalledWith('email-1/0_pitch.txt')
    expect(persistMetadata).not.toHaveBeenCalled()
  })

  it('rolls back every object when database metadata cannot be committed', async () => {
    const store = vi.fn(async ({ filename }: { filename: string }) => `email-1/${filename}`)
    const remove = vi.fn(async () => undefined)
    const persistMetadata = vi.fn(async () => {
      throw new Error('database unavailable')
    })

    const result = await persistPreparedSubmissionAttachments(ATTACHMENTS, {
      store,
      remove,
      persistMetadata,
    })

    expect(result).toEqual({ ok: false, code: 'attachment_storage_failed' })
    expect(remove).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledWith('email-1/0_pitch.txt')
    expect(remove).toHaveBeenCalledWith('email-1/1_model.csv')
  })
})
