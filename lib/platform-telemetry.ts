export type PlatformTelemetryEnvironment = Readonly<Record<string, string | undefined>>

export function isPlatformTelemetryEnabled(
  environment: PlatformTelemetryEnvironment,
): boolean {
  return environment.VERCEL === '1'
    || environment.NEXT_PUBLIC_ENABLE_VERCEL_TELEMETRY === 'true'
}
