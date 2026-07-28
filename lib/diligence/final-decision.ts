const FINAL_DECISION_STATUS_SET: ReadonlySet<string> = new Set([
  'invested',
  'passed',
  'won',
  'lost',
])

export function isFinalDecisionStatus(status: string): boolean {
  return FINAL_DECISION_STATUS_SET.has(status)
}
