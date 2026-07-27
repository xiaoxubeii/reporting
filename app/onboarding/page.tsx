import OnboardingClient from './onboarding-client'

export default function OnboardingPage() {
  const rootDomain = process.env.FUND_WORKSPACE_ROOT_DOMAIN?.trim() || 'fundworkspace.com'
  return <OnboardingClient rootDomain={rootDomain} />
}
