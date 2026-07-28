import { describe, expect, it } from 'vitest'
import { isPlatformTelemetryEnabled } from './platform-telemetry'

describe('isPlatformTelemetryEnabled', () => {
  it('does not mount Vercel telemetry on local or generic self-host deployments', () => {
    expect(isPlatformTelemetryEnabled({})).toBe(false)
    expect(isPlatformTelemetryEnabled({ NODE_ENV: 'development' })).toBe(false)
    expect(isPlatformTelemetryEnabled({ NODE_ENV: 'production' })).toBe(false)
  })

  it('mounts telemetry on Vercel or with an explicit public opt-in', () => {
    expect(isPlatformTelemetryEnabled({ VERCEL: '1' })).toBe(true)
    expect(isPlatformTelemetryEnabled({ NEXT_PUBLIC_ENABLE_VERCEL_TELEMETRY: 'true' })).toBe(true)
  })

  it('does not accept loosely truthy opt-in values', () => {
    expect(isPlatformTelemetryEnabled({ VERCEL: 'true' })).toBe(false)
    expect(isPlatformTelemetryEnabled({ NEXT_PUBLIC_ENABLE_VERCEL_TELEMETRY: '1' })).toBe(false)
  })
})
