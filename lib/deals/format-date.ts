/**
 * Format deal dates without consulting the runtime locale or timezone.
 * Client components are also pre-rendered on the server, so relying on either
 * environment would produce different hydration text.
 */
export function formatDealDate(value: string | null | undefined): string | null {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`
}
