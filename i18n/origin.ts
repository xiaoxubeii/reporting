export function isDevelopmentLoopbackForward(requestOrigin: string, appOrigin: string): boolean {
  if (process.env.NODE_ENV === 'production') return false

  try {
    const requestUrl = new URL(requestOrigin)
    const appUrl = new URL(appOrigin)
    const browserLoopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
    const internalDevelopmentHosts = new Set([
      'localhost',
      '127.0.0.1',
      '[::1]',
      '0.0.0.0',
      '[::]',
    ])

    return (
      requestUrl.protocol === appUrl.protocol &&
      browserLoopbackHosts.has(requestUrl.hostname) &&
      internalDevelopmentHosts.has(appUrl.hostname)
    )
  } catch {
    return false
  }
}
