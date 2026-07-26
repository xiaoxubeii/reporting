import { createAdminClient } from '@/lib/supabase/admin'
import type { DiligenceOutputLanguage } from './output-language'

type Admin = ReturnType<typeof createAdminClient>

export type DiligenceOutputLanguageChangeStatus = 'noop' | 'updated' | 'version_created'

export interface DiligenceOutputLanguageChangeResult {
  status: DiligenceOutputLanguageChangeStatus
  output_language: DiligenceOutputLanguage
  draft_id: string | null
  source_draft_id: string | null
}

export class DiligenceOutputLanguageChangeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: 'confirmation_required' | 'version_conflict',
    readonly expectedDraftId?: string | null,
  ) {
    super(message)
    this.name = 'DiligenceOutputLanguageChangeError'
  }
}

export async function changeDiligenceOutputLanguage(params: {
  admin: Admin
  fundId: string
  dealId: string
  userId: string
  outputLanguage: DiligenceOutputLanguage
  confirmVersion?: boolean
  expectedDraftId?: string | null
}): Promise<DiligenceOutputLanguageChangeResult> {
  const { data, error } = await params.admin.rpc('change_diligence_output_language', {
    p_deal_id: params.dealId,
    p_fund_id: params.fundId,
    p_output_language: params.outputLanguage,
    p_user_id: params.userId,
    p_confirm_version: params.confirmVersion === true,
    p_expected_draft_id: params.expectedDraftId ?? null,
  })

  if (error) {
    if (error.code === 'P0001' && error.message.includes('DILIGENCE_LANGUAGE_CONFIRMATION_REQUIRED')) {
      throw new DiligenceOutputLanguageChangeError(
        'Confirm creation of a new diligence language version.',
        409,
        'confirmation_required',
        error.details || null,
      )
    }
    if (error.code === '40001' && error.message.includes('DILIGENCE_LANGUAGE_VERSION_STALE')) {
      throw new DiligenceOutputLanguageChangeError(
        'The active diligence version changed. Review it and try again.',
        409,
        'version_conflict',
        error.details || null,
      )
    }
    if (error.code === '55006') {
      throw new DiligenceOutputLanguageChangeError(
        'A diligence generation job is in progress. Try again when it finishes.',
        409,
      )
    }
    if (error.code === 'P0002') {
      throw new DiligenceOutputLanguageChangeError('Diligence deal not found.', 404)
    }
    throw new DiligenceOutputLanguageChangeError('Could not change diligence language.', 500)
  }

  const result = data as unknown as DiligenceOutputLanguageChangeResult | null
  if (!result || !['noop', 'updated', 'version_created'].includes(result.status)) {
    throw new DiligenceOutputLanguageChangeError('Could not change diligence language.', 500)
  }
  return result
}
