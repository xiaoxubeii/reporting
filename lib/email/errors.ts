export type FundEmailErrorCode =
  | 'invalid_configuration'
  | 'invalid_domain'
  | 'invalid_slug'
  | 'invalid_mailbox'
  | 'invalid_header'
  | 'fund_not_found'
  | 'membership_required'
  | 'connection_not_found'
  | 'connection_conflict'
  | 'delivery_failed'
  | 'encryption_unavailable'
  | 'credential_unavailable'
  | 'storage_unavailable'

export class FundEmailError extends Error {
  constructor(
    public readonly code: FundEmailErrorCode,
    message: string,
    public readonly status = 400,
  ) {
    super(message)
    this.name = 'FundEmailError'
  }
}
