// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FollowingSourceActions } from '@/components/feeds/following-source-actions'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/popover', async () => {
  const ReactModule = await import('react')
  const PopoverContext = ReactModule.createContext<{ open: boolean; setOpen: (open: boolean) => void }>({
    open: false,
    setOpen: () => undefined,
  })
  return {
    Popover: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) => (
      <PopoverContext.Provider value={{ open, setOpen: onOpenChange }}>{children}</PopoverContext.Provider>
    ),
    PopoverTrigger: ({ children }: { children: React.ReactElement<{ onClick?: () => void }> }) => {
      const { open, setOpen } = ReactModule.useContext(PopoverContext)
      return ReactModule.cloneElement(children, { onClick: () => setOpen(!open) })
    },
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const { open, setOpen } = ReactModule.useContext(PopoverContext)
      return open ? <div onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>{children}</div> : null
    },
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: undefined })
})

describe('FollowingSourceActions', () => {
  it('opens the source safely and exposes only supported management actions', () => {
    render(<FollowingSourceActions sourceName="Nature" siteUrl="https://nature.com" feedUrl="https://nature.com/rss" pending={false} onCopied={vi.fn()} onError={vi.fn()} onUnfollow={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'actions.menuLabel' }))

    const link = screen.getByRole('link', { name: 'actions.openSourceLabel' })
    expect(link.getAttribute('href')).toBe('https://nature.com')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByRole('button', { name: 'actions.copyRssLabel' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'actions.unfollowLabel' })).toBeDefined()
  })

  it('copies the exact RSS URL and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } })
    const onCopied = vi.fn()
    render(<FollowingSourceActions sourceName="Nature" siteUrl={null} feedUrl="https://nature.com/rss" pending={false} onCopied={onCopied} onError={vi.fn()} onUnfollow={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'actions.menuLabel' }))

    fireEvent.click(screen.getByRole('button', { name: 'actions.copyRssLabel' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://nature.com/rss'))
    expect(onCopied).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'actions.copyRssLabel' })).toBeNull()
  })

  it('reports clipboard failure and keeps unfollow bound to the endpoint callback', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } })
    const onError = vi.fn()
    const onUnfollow = vi.fn()
    render(<FollowingSourceActions sourceName="Nature" siteUrl={null} feedUrl="https://nature.com/rss" pending={false} onCopied={vi.fn()} onError={onError} onUnfollow={onUnfollow} />)
    fireEvent.click(screen.getByRole('button', { name: 'actions.menuLabel' }))

    fireEvent.click(screen.getByRole('button', { name: 'actions.copyRssLabel' }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('actions.copyFailed'))

    fireEvent.click(screen.getByRole('button', { name: 'actions.unfollowLabel' }))
    expect(onUnfollow).toHaveBeenCalledOnce()
  })

  it('reports unavailable clipboard access and blocks unfollow while pending', async () => {
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: undefined })
    const onError = vi.fn()
    const onUnfollow = vi.fn()
    const view = render(<FollowingSourceActions sourceName="Nature" siteUrl={null} feedUrl="https://nature.com/rss" pending={false} onCopied={vi.fn()} onError={onError} onUnfollow={onUnfollow} />)
    fireEvent.click(screen.getByRole('button', { name: 'actions.menuLabel' }))

    fireEvent.click(screen.getByRole('button', { name: 'actions.copyRssLabel' }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('actions.copyFailed'))

    view.rerender(<FollowingSourceActions sourceName="Nature" siteUrl={null} feedUrl="https://nature.com/rss" pending onCopied={vi.fn()} onError={onError} onUnfollow={onUnfollow} />)
    fireEvent.click(screen.getByRole('button', { name: 'actions.unfollowLabel' }))
    expect(onUnfollow).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'actions.menuLabel' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('distinguishes endpoint names and closes the action surface on Escape', () => {
    render(<FollowingSourceActions sourceName="Nature" endpointLabel="/cardiology.rss" siteUrl={null} feedUrl="https://nature.com/cardiology.rss" pending={false} onCopied={vi.fn()} onError={vi.fn()} onUnfollow={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'actions.menuLabel' })
    fireEvent.click(trigger)
    const copy = screen.getByRole('button', { name: 'actions.copyRssLabel' })
    fireEvent.keyDown(copy, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'actions.copyRssLabel' })).toBeNull()
  })
})
