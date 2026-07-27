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
  it('presents the compact executive narrative and one active product view', () => {
    renderLocalized(
      <PlatformLanding
        config={{ demoUrl: 'https://calendar.example/demo', platformOrigin: 'https://fundworkspace.example' }}
      />,
    )

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      "One workspace for the fund's investment and operating workflow.",
    )
    expect(screen.getByRole('region', { name: 'Management outcomes' })).not.toBeNull()
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(screen.getByRole('tab', { name: 'Market signals' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByText('Expert validation when it matters', { selector: 'h2' })).not.toBeNull()
    expect(screen.getByText(/when material gaps or contradictions need external scrutiny/i)).not.toBeNull()
    expect(screen.queryByText('One workspace, every operating surface')).toBeNull()
    expect(document.querySelector('[data-floating-navigation]')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Request a demo' })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: 'Enter workspace' })).toHaveLength(3)
  })

  it('switches the workflow product view from the keyboard-accessible tabs', () => {
    renderLocalized(
      <PlatformLanding config={{ demoUrl: null, platformOrigin: 'https://fundworkspace.example' }} />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Portfolio and LPs' }))
    expect(screen.getByRole('tab', { name: 'Portfolio and LPs' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toContain('Continue the operating relationship')
    expect(screen.getByRole('img', { name: 'FundWorkspace LP portal' })).not.toBeNull()
  })

  it('omits demo actions without leaving an empty action slot', () => {
    renderLocalized(
      <PlatformLanding config={{ demoUrl: null, platformOrigin: 'https://fundworkspace.example' }} />,
    )

    expect(screen.queryAllByRole('link', { name: 'Request a demo' })).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Enter workspace' })).toHaveLength(3)
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
