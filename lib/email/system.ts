import { sendOutboundEmail, type EmailParams, type OutboundConfig } from '@/lib/email'
import { assertSafeEmailHeader, fundEmailBaseDomain, normalizeDnsDomain } from './domain'
import { FundEmailError } from './errors'

export interface PlatformEmailConfiguration {
  apiKey: string
  from: string
}

type PlatformEmailParams = Omit<EmailParams, 'from'>

interface PlatformEmailDependencies {
  send?: (
    config: OutboundConfig,
    params: EmailParams,
  ) => Promise<{ id?: string }>
}

export function getPlatformEmailConfiguration(): PlatformEmailConfiguration {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.SYSTEM_EMAIL_FROM?.trim()
  if (!apiKey || !from || /[\r\n\0]/.test(apiKey)) {
    throw new FundEmailError(
      'invalid_configuration',
      'Platform email is not configured.',
      503,
    )
  }

  const safeFrom = assertSafeEmailHeader(from, 'platform sender', 320)
  const senderDomain = extractSenderDomain(safeFrom)
  const baseDomain = fundEmailBaseDomain()
  if (senderDomain !== baseDomain) {
    throw new FundEmailError(
      'invalid_configuration',
      `Platform email must use the exact ${baseDomain} domain.`,
      503,
    )
  }
  return { apiKey, from: safeFrom }
}

export async function sendPlatformEmail(
  params: PlatformEmailParams,
  dependencies: PlatformEmailDependencies = {},
): Promise<{ id?: string }> {
  const platform = getPlatformEmailConfiguration()
  return (dependencies.send ?? sendOutboundEmail)(
    { provider: 'resend', apiKey: platform.apiKey },
    { ...params, from: platform.from },
  )
}

function extractSenderDomain(from: string): string {
  const angleAddress = from.match(/<([^<>]+)>$/)?.[1]
  const address = (angleAddress ?? from).trim()
  const match = address.match(/^[^@\s<>]+@([^@\s<>]+)$/)
  if (!match) {
    throw new FundEmailError('invalid_configuration', 'Platform email sender is invalid.', 503)
  }
  return normalizeDnsDomain(match[1])
}
