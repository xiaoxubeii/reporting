export class IdentityOnboardingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'IdentityOnboardingError'
  }
}

export function identityStorageError(): IdentityOnboardingError {
  return new IdentityOnboardingError(
    'storage_unavailable',
    'Identity service is temporarily unavailable.',
    503,
  )
}
