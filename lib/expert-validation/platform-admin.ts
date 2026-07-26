export function mayManagePlatformExperts(fundId: string, role: string): boolean {
  const operationsFundId = process.env.EXPERT_GLOBAL_ADMIN_FUND_ID?.trim()
  return role === 'admin' && Boolean(operationsFundId) && operationsFundId === fundId
}
