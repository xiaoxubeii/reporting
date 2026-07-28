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
  it('presents the connected investment narrative and primary actions', () => {
    renderLocalized(
      <PlatformLanding
        config={{ demoUrl: 'https://calendar.example/demo', platformOrigin: 'https://fundworkspace.example' }}
      />,
    )

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Turn market signals into investment decisions.',
    )
    expect(screen.getByRole('region', { name: 'One workspace, across every team decision' })).not.toBeNull()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.getByText('Industry expert validation', { selector: 'h2' })).not.toBeNull()
    expect(screen.getByText('Turn judgment into an institutional record', { selector: 'h3' })).not.toBeNull()
    expect(screen.getAllByRole('link', { name: 'Request a demo' })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: 'Find your workspace' })).toHaveLength(3)
  })

  it('keeps portfolio continuity in the same product narrative', () => {
    renderLocalized(
      <PlatformLanding config={{ demoUrl: null, platformOrigin: 'https://fundworkspace.example' }} />,
    )

    expect(screen.getByText('Portfolio continuity', { selector: 'h3' })).not.toBeNull()
    expect(screen.getByText(/continue into operations, reporting, and LP communication after investment/i)).not.toBeNull()
    expect(screen.getByRole('img', { name: 'FundWorkspace LP portal' })).not.toBeNull()
  })

  it('omits demo actions without leaving an empty action slot', () => {
    renderLocalized(
      <PlatformLanding config={{ demoUrl: null, platformOrigin: 'https://fundworkspace.example' }} />,
    )

    expect(screen.queryAllByRole('link', { name: 'Request a demo' })).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Find your workspace' })).toHaveLength(3)
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
