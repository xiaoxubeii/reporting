/**
 * Labels reserved anywhere under the Fund workspace or business-email root.
 * A Fund slug becomes both identities permanently, so every consumer must use
 * this single union rather than applying narrower, incompatible allowlists.
 */
export const RESERVED_FUND_NAMESPACE_LABELS = new Set([
  'abuse',
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'docs',
  'fundworkspace',
  'hooks',
  'internal',
  'mail',
  'postmaster',
  'security',
  'smtp',
  'status',
  'support',
  'www',
])
