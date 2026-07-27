/** @vitest-environment jsdom */

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import englishMessages from '@/messages/en.json'
import { ExistingWorkspace } from '@/components/platform-landing/existing-workspace'
import { PlatformLanding } from '@/components/platform-landing/platform-landing'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

afterEach(cleanup)

function renderLocalized(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={englishMessages}>
      {node}
    </NextIntlClientProvider>,
  )
}

describe('PlatformLanding', () => {
  it('presents the approved institutional workflow and real product evidence', () => {
    renderLocalized(
      <PlatformLanding
        config={{ demoUrl: 'https://calendar.example/demo', platformOrigin: 'https://fundworkspace.example' }}
      />,
    )

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Turn market signals into investment decisions')
    expect(screen.getByText('Industry expert validation', { selector: 'h2' })).not.toBeNull()
    expect(screen.getByText(/when the evidence needs it/i)).not.toBeNull()
    expect(screen.getAllByRole('img').map(image => image.getAttribute('alt'))).toEqual(expect.arrayContaining([
      'FundWorkspace diligence research with expert validation controls',
      'FundWorkspace deal pipeline',
      'FundWorkspace LP portal',
    ]))
    expect(screen.getAllByRole('link', { name: 'Request a demo' })[0].getAttribute('href')).toBe(
      'https://calendar.example/demo',
    )
    expect(
      screen
        .getAllByRole('link', { name: 'Platform' })
        .every(link => link.getAttribute('href') === '#platform'),
    ).toBe(true)
  })

  it('omits demo actions when no safe server-side URL is configured', () => {
    renderLocalized(
      <PlatformLanding config={{ demoUrl: null, platformOrigin: 'https://fundworkspace.example' }} />,
    )

    expect(screen.queryAllByRole('link', { name: 'Request a demo' })).toHaveLength(0)
  })
})

describe('ExistingWorkspace', () => {
  it('validates generically and navigates only to a canonical tenant auth URL', () => {
    const navigate = vi.fn()
    renderLocalized(
      <ExistingWorkspace platformOrigin="https://fundworkspace.example" navigate={navigate} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Find your workspace' }))
    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: 'foreign.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert').textContent).toContain('Enter your FundWorkspace slug or workspace address.')
    expect(navigate).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: 'northstar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(navigate).toHaveBeenCalledWith('https://northstar.fundworkspace.example/auth')
  })
})
