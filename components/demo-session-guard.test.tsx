// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoSessionGuard } from './demo-session-guard'

describe('DemoSessionGuard', () => {
  const sendBeacon = vi.fn(() => true)

  beforeEach(() => {
    sendBeacon.mockClear()
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    })
  })

  it('does not destroy a viewer session on reload or same-origin navigation', () => {
    const { getByText } = render(<>
      <DemoSessionGuard />
      <a href="/deals" onClick={event => event.preventDefault()}>Deals</a>
    </>)

    fireEvent(window, new Event('beforeunload'))
    fireEvent.click(getByText('Deals'))
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('ends the demo session before following an external link', () => {
    const { getByText } = render(<>
      <DemoSessionGuard />
      <a href="https://example.com/leave">Leave</a>
    </>)

    document.addEventListener('click', event => event.preventDefault(), { once: true })
    fireEvent.click(getByText('Leave'))
    expect(sendBeacon).toHaveBeenCalledWith('/api/auth/logout')
  })

  it('keeps the current viewer session when an external source opens in a new tab', () => {
    const { getByText } = render(<>
      <DemoSessionGuard />
      <a href="https://example.com/source" target="_blank" rel="noreferrer">Source</a>
    </>)

    fireEvent.click(getByText('Source'))
    expect(sendBeacon).not.toHaveBeenCalled()
  })
})
