export function hasAnyExplicitConfiguration(environment, keys) {
  return keys.some(key => Boolean(environment[key]?.trim()))
}

export function decideServiceCleanup({
  ownedLifecycle,
  keepServices,
  injectedProviders,
}) {
  if (ownedLifecycle && !keepServices) return 'stop'
  if (injectedProviders) return 'restore'
  return 'none'
}
