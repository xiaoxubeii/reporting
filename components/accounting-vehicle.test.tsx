// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VehicleProvider } from './accounting-vehicle'

const useCanRead = vi.hoisted(() => vi.fn())
vi.mock('./access-context', () => ({ useCanRead }))

describe('VehicleProvider access-aware bootstrap', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([]))))
    useCanRead.mockReset()
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('does not request the accounting vehicle index for a user without accounting read access', async () => {
    useCanRead.mockReturnValue(false)
    render(<VehicleProvider><div>child</div></VehicleProvider>)

    await Promise.resolve()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('loads the initial vehicle only when accounting read access is available', async () => {
    useCanRead.mockReturnValue(true)
    render(<VehicleProvider><div>child</div></VehicleProvider>)

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/accounting/vehicle-index'))
  })
})
