import { describe, expect, it, vi } from 'vitest'
import {
  buildPublicSubmissionFallbackDeal,
  ensureProcessedDeal,
  queueFallbackDealResearch,
} from './public-submission-fallback'
import { DealResearchQueueError } from './research-queue'

describe('buildPublicSubmissionFallbackDeal', () => {
  it('preserves structured Pitch fields without inventing AI conclusions', () => {
    const row = buildPublicSubmissionFallbackDeal({
      emailId: 'email-1',
      fundId: 'fund-1',
      companyName: 'Cardio Signal',
      companyUrl: 'https://www.cardiosignal.example/product',
      founderName: 'Alex Founder',
      founderEmail: 'alex@cardiosignal.example',
      pitch: 'A clinically validated cardiovascular workflow product for hospitals.',
    })

    expect(row).toMatchObject({
      email_id: 'email-1',
      fund_id: 'fund-1',
      company_name: 'Cardio Signal',
      company_url: 'https://www.cardiosignal.example/product',
      company_domain: 'cardiosignal.example',
      founder_name: 'Alex Founder',
      founder_email: 'alex@cardiosignal.example',
      company_summary: 'A clinically validated cardiovascular workflow product for hospitals.',
      status: 'new',
      research_status: 'skipped',
      thesis_fit_score: null,
      thesis_fit_analysis: null,
    })
  })

  it('does not derive a domain when no company URL was submitted', () => {
    expect(buildPublicSubmissionFallbackDeal({
      emailId: 'email-2',
      fundId: 'fund-1',
      companyName: 'Private Co',
      companyUrl: '',
      founderName: 'Founder',
      founderEmail: 'founder@gmail.com',
      pitch: 'A sufficiently detailed pitch that remains available for manual review.',
    }).company_domain).toBeNull()
  })

  it('preserves explicit introduction metadata from an admin-created Deal', () => {
    expect(buildPublicSubmissionFallbackDeal({
      emailId: 'email-3',
      fundId: 'fund-1',
      companyName: 'Referred Co',
      companyUrl: 'https://referred.example',
      founderName: 'Founder',
      founderEmail: 'founder@referred.example',
      pitch: 'A partner-entered pitch with explicit referral information.',
      introSource: 'warm_intro',
      referrerName: 'Trusted Scout',
      referrerEmail: 'scout@example.com',
    })).toMatchObject({
      intro_source: 'warm_intro',
      referrer_name: 'Trusted Scout',
      referrer_email: 'scout@example.com',
    })
  })

  it('uses the pipeline Deal without inserting a fallback', async () => {
    const insertFallback = vi.fn()

    await expect(ensureProcessedDeal({ dealId: 'deal-from-pipeline' }, insertFallback)).resolves.toEqual({
      dealId: 'deal-from-pipeline',
      usedFallback: false,
    })
    expect(insertFallback).not.toHaveBeenCalled()
  })

  it('inserts a fallback when the pipeline returns a null Deal id', async () => {
    const insertFallback = vi.fn().mockResolvedValue({ id: 'fallback-deal' })

    await expect(ensureProcessedDeal({ dealId: null }, insertFallback)).resolves.toEqual({
      dealId: 'fallback-deal',
      usedFallback: true,
    })
    expect(insertFallback).toHaveBeenCalledOnce()
  })

  it('fails closed when neither the pipeline nor the fallback persists a Deal', async () => {
    await expect(ensureProcessedDeal(
      { dealId: null },
      vi.fn().mockResolvedValue(null),
    )).rejects.toThrow('Fallback Deal insert failed')
  })
})

describe('queueFallbackDealResearch', () => {
  it('queues with a system actor when Research is enabled', async () => {
    const queue = vi.fn().mockResolvedValue({ queued: true, already: false, jobId: 'job-1' })
    await expect(queueFallbackDealResearch({ dealId: 'deal-1', fundId: 'fund-1' }, queue)).resolves.toEqual({ queued: true })
    expect(queue).toHaveBeenCalledWith({ dealId: 'deal-1', fundId: 'fund-1', actor: { type: 'system' } })
  })

  it('treats a disabled Fund setting as an intentional no-op', async () => {
    const queue = vi.fn().mockRejectedValue(new DealResearchQueueError('disabled', 'disabled'))
    await expect(queueFallbackDealResearch({ dealId: 'deal-1', fundId: 'fund-1' }, queue)).resolves.toEqual({ queued: false })
  })

  it('does not hide storage failures', async () => {
    const queue = vi.fn().mockRejectedValue(new DealResearchQueueError('storage', 'failed'))
    await expect(queueFallbackDealResearch({ dealId: 'deal-1', fundId: 'fund-1' }, queue)).rejects.toThrow('failed')
  })
})
