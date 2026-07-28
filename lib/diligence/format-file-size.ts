type NumberFormatter = (
  value: number,
  options?: { maximumFractionDigits?: number },
) => string

export function formatFileSize(
  bytes: number | null,
  formatNumber: NumberFormatter,
): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${formatNumber(bytes)} B`
  if (bytes < 1024 * 1024) {
    return `${formatNumber(bytes / 1024, { maximumFractionDigits: 0 })} KB`
  }
  return `${formatNumber(bytes / 1024 / 1024, { maximumFractionDigits: 1 })} MB`
}
