/**
 * Every React surface under the Funds route. Keep this explicit so newly added
 * accounting screens cannot silently bypass the localization coverage check.
 */
export const FUND_UI_FILES = [
  'app/(app)/funds/[id]/bank/page.tsx',
  'app/(app)/funds/[id]/capital-accounts/[lpEntityId]/page.tsx',
  'app/(app)/funds/[id]/capital-accounts/page.tsx',
  'app/(app)/funds/[id]/fund-detail-view.tsx',
  'app/(app)/funds/[id]/journal/page.tsx',
  'app/(app)/funds/[id]/opening-balances/page.tsx',
  'app/(app)/funds/[id]/page.tsx',
  'app/(app)/funds/[id]/periods/page.tsx',
  'app/(app)/funds/[id]/schedule-of-investments/page.tsx',
  'app/(app)/funds/[id]/statements/page.tsx',
  'app/(app)/funds/[id]/status/page.tsx',
  'app/(app)/funds/allocation-terms/carry-terms.tsx',
  'app/(app)/funds/allocation-terms/view.tsx',
  'app/(app)/funds/bank/view.tsx',
  'app/(app)/funds/capital-accounts/[lpEntityId]/view.tsx',
  'app/(app)/funds/capital-accounts/capital-source-card.tsx',
  'app/(app)/funds/capital-accounts/gp-panel.tsx',
  'app/(app)/funds/capital-accounts/reconciliation-panel.tsx',
  'app/(app)/funds/capital-accounts/view.tsx',
  'app/(app)/funds/entry-modal.tsx',
  'app/(app)/funds/fund-overview.tsx',
  'app/(app)/funds/journal/view.tsx',
  'app/(app)/funds/layout.tsx',
  'app/(app)/funds/opening-balances/snapshot-cutover.tsx',
  'app/(app)/funds/opening-balances/view.tsx',
  'app/(app)/funds/page.tsx',
  'app/(app)/funds/periods/view.tsx',
  'app/(app)/funds/schedule-of-investments/view.tsx',
  'app/(app)/funds/setup.tsx',
  'app/(app)/funds/statements/view.tsx',
  'app/(app)/funds/status/deal-carry-card.tsx',
  'app/(app)/funds/status/view.tsx',
] as const

/** The layout only renders its children and therefore has no authored copy. */
export const FUND_TEXT_FREE_FILES = ['app/(app)/funds/layout.tsx'] as const

export const FUND_LOCALIZED_FILES = FUND_UI_FILES.filter(
  file => !(FUND_TEXT_FREE_FILES as readonly string[]).includes(file),
)
