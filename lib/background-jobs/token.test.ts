import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'

import {
  issueBackgroundJobToken,
  parseBearerJobToken,
  verifyBackgroundJobToken,
} from './token'

const SIGNING_KEY_FIXTURE = ['background-job-test', 'signing-key', '0123456789'].join('-')
const JOB_ID = '842e532a-b848-457a-9b8e-4d6d8da10caf'
const ATTEMPT_ID = '1cd393ce-753b-4021-9848-f41d5205a4c8'
const NOW = new Date('2026-07-25T13:00:00.000Z')

describe('background Job Tokens', () => {
  it('issues and verifies one exact worker-audience attempt token', async () => {
    const token = await issueBackgroundJobToken({
      jobId: JOB_ID,
      attemptId: ATTEMPT_ID,
      audience: 'reporting-deal-research-worker',
      tokenId: ATTEMPT_ID,
      leaseExpiresAt: new Date(NOW.getTime() + 300_000),
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
    })

    await expect(verifyBackgroundJobToken(token, {
      audience: 'reporting-deal-research-worker',
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
    })).resolves.toEqual({
      jobId: JOB_ID,
      attemptId: ATTEMPT_ID,
      audience: 'reporting-deal-research-worker',
      tokenId: ATTEMPT_ID,
    })
    await expect(verifyBackgroundJobToken(token, {
      audience: 'reporting-search',
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
    })).rejects.toThrow('Invalid background Job Token')
  })

  it('binds Search tokens to a separate audience and tool call id', async () => {
    const token = await issueBackgroundJobToken({
      jobId: JOB_ID,
      attemptId: ATTEMPT_ID,
      audience: 'reporting-search',
      tokenId: 'call_abc123',
      leaseExpiresAt: new Date(NOW.getTime() + 120_000),
      now: NOW,
      secret: SIGNING_KEY_FIXTURE,
    })

    await expect(verifyBackgroundJobToken(token, {
      audience: 'reporting-search', now: NOW, secret: SIGNING_KEY_FIXTURE,
    })).resolves.toMatchObject({ tokenId: 'call_abc123', attemptId: ATTEMPT_ID })
  })

  it('rejects weak secrets, expired tokens, wrong algorithms, and extra claims', async () => {
    await expect(issueBackgroundJobToken({
      jobId: JOB_ID,
      attemptId: ATTEMPT_ID,
      audience: 'reporting-search',
      tokenId: 'call_1',
      leaseExpiresAt: new Date(NOW.getTime() + 60_000),
      now: NOW,
      secret: 'weak',
    })).rejects.toThrow('at least 32 bytes')

    const key = new TextEncoder().encode(SIGNING_KEY_FIXTURE)
    const expired = await new SignJWT({ job_attempt: ATTEMPT_ID })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('reporting-background-jobs')
      .setAudience('reporting-search')
      .setSubject(JOB_ID)
      .setJti('call_expired')
      .setIssuedAt(Math.floor(NOW.getTime() / 1000) - 120)
      .setNotBefore(Math.floor(NOW.getTime() / 1000) - 120)
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) - 60)
      .sign(key)
    await expect(verifyBackgroundJobToken(expired, {
      audience: 'reporting-search', now: NOW, secret: SIGNING_KEY_FIXTURE,
    })).rejects.toThrow('Invalid background Job Token')

    const extra = await new SignJWT({ job_attempt: ATTEMPT_ID, userId: JOB_ID })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('reporting-background-jobs')
      .setAudience('reporting-search')
      .setSubject(JOB_ID)
      .setJti('call_extra')
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setNotBefore(Math.floor(NOW.getTime() / 1000) - 1)
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 60)
      .sign(key)
    await expect(verifyBackgroundJobToken(extra, {
      audience: 'reporting-search', now: NOW, secret: SIGNING_KEY_FIXTURE,
    })).rejects.toThrow('Invalid background Job Token')
  })

  it('parses only one strict Bearer credential', () => {
    expect(parseBearerJobToken('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    for (const value of [null, '', 'Basic value', 'bearer token', 'Bearer', 'Bearer a b', 'Bearer a,Bearer b']) {
      expect(() => parseBearerJobToken(value)).toThrow('Invalid background Job Token')
    }
  })
})
