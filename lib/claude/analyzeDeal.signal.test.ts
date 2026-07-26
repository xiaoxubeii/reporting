import { describe, expect, it, vi } from 'vitest'
import type { AIProvider } from '@/lib/ai/types'
import { analyzeDeal } from './analyzeDeal'

describe('analyzeDeal cancellation', () => {
  it('uses one caller deadline for both the initial and JSON-repair calls', async () => {
    const signal = AbortSignal.timeout(30_000)
    const createMessage = vi.fn()
      .mockResolvedValueOnce({ text: 'not json', usage: {} })
      .mockResolvedValueOnce({ text: '{}', usage: {} })
    const provider = { name: 'test', createMessage } as unknown as AIProvider

    await analyzeDeal({
      emailSubject: 'Pitch',
      emailBody: 'Body',
      combinedAttachmentText: '',
      pdfBase64s: [],
      images: [],
      thesis: '',
      screeningPrompt: '',
      provider,
      providerType: 'test',
      model: 'test-model',
      signal,
    })

    expect(createMessage).toHaveBeenCalledTimes(2)
    expect(createMessage.mock.calls[0]?.[0]?.signal).toBe(signal)
    expect(createMessage.mock.calls[1]?.[0]?.signal).toBe(signal)
  })
})
