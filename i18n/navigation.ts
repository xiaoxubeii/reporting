export interface LocaleSwitchLocation {
  pathname: string
  search: string
  hash: string
}

export interface PendingLocaleLocation {
  pathAndSearch: string
  hash: string
}

export function localeHashRestoreUrl(
  pending: PendingLocaleLocation,
  current: LocaleSwitchLocation,
): string | null {
  const currentPathAndSearch = `${current.pathname}${current.search}`
  if (
    currentPathAndSearch !== pending.pathAndSearch ||
    !pending.hash ||
    current.hash
  ) {
    return null
  }

  return `${currentPathAndSearch}${pending.hash}`
}
