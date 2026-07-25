import { describe, expect, it } from 'vitest'

import { issueBackgroundJobToken } from '@/lib/background-jobs/token'

const configured = Boolean(
  process.env.BACKGROUND_JOB_E2E_BASE_URL
  && process.env.BACKGROUND_JOB_E2E_JOB_ID
  && process.env.BACKGROUND_JOB_E2E_ATTEMPT_ID
  && process.env.BACKGROUND_JOB_TOKEN_SECRET,
)

describe.runIf(configured)('background Job Token live HTTP boundary', () => {
  it('rejects a cryptographically valid token after its database attempt is terminal', async () => {
    const now = new Date()
    const toolCallId = 'call_stale_live_check'
    const token = await issueBackgroundJobToken({
      jobId: process.env.BACKGROUND_JOB_E2E_JOB_ID!,
      attemptId: process.env.BACKGROUND_JOB_E2E_ATTEMPT_ID!,
      audience: 'reporting-search',
      tokenId: toolCallId,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      now,
      secret: process.env.BACKGROUND_JOB_TOKEN_SECRET!,
    })
    const response = await fetch(`${process.env.BACKGROUND_JOB_E2E_BASE_URL}/api/search`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: 'SceneAct AI evidence', toolCallId }),
      redirect: 'error',
    })
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: 'unauthorized' },
    })
  })
})
