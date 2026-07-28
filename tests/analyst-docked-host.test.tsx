// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalystProvider, useAnalystContext } from '@/components/analyst-context'
import { AnalystContextActions } from '@/components/analyst-context-actions'
import { AnalystFloatingHost } from '@/components/analyst-floating-host'
import { AnalystDiligenceScope } from '@/components/analyst-scope'
import { MobileDrawerPanel } from '@/components/mobile-drawer-panel'
import { ASSISTANT_CONTEXT_MIME, type AssistantContextSnapshot } from '@/lib/analyst/context-snapshot'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/analyst-panel', () => ({
  AnalystPanel: () => <div data-testid="assistant-panel-stub" />,
}))

const snapshot: AssistantContextSnapshot = Object.freeze({
  version: 1,
  id: 'feed-1',
  kind: 'feed_article',
  title: 'Cardiovascular AI',
  text: 'Visible article summary.',
  sourceLabel: 'Nature Reviews Cardiology',
  sourceUrl: 'https://example.com/article',
  capturedAt: '2026-07-27T12:00:00.000Z',
})

function Probe() {
  const { activeContexts, close, open } = useAnalystContext()
  return (
    <>
      <output data-testid="open-state">{String(open)}</output>
      <output data-testid="active-contexts">{activeContexts.map(item => item.id).join(',')}</output>
      <button type="button" onClick={close}>close probe</button>
    </>
  )
}

function Surface({ withAction = false }: { withAction?: boolean }) {
  return (
    <AnalystProvider hasAIKey configuredProviders={[]} defaultAIProvider="anthropic" fundName="Fund">
      <AnalystFloatingHost>
        <main data-testid="shell-content">Content</main>
      </AnalystFloatingHost>
      {withAction && <AnalystContextActions snapshot={snapshot} />}
      <Probe />
    </AnalystProvider>
  )
}

const diligenceDealId = '11111111-1111-4111-8111-111111111111'

function DiligenceProbe() {
  const {
    conversationId,
    diligenceDealId: currentDealId,
    diligenceProjectName,
    domain,
    loadConversation,
    loadConversations,
    messages,
    scopeRevision,
  } = useAnalystContext()
  return (
    <>
      <output data-testid="diligence-domain">{domain ?? ''}</output>
      <output data-testid="diligence-deal-id">{currentDealId ?? ''}</output>
      <output data-testid="diligence-project-name">{diligenceProjectName ?? ''}</output>
      <output data-testid="diligence-scope-revision">{scopeRevision}</output>
      <output data-testid="diligence-conversation-id">{conversationId ?? ''}</output>
      <output data-testid="diligence-messages">{messages.map(message => message.content).join('|')}</output>
      <button type="button" onClick={() => void loadConversations()}>load project history</button>
      <button type="button" onClick={() => void loadConversation(`legacy-diligence:${diligenceDealId}`)}>load legacy history</button>
    </>
  )
}

function DiligenceSurface() {
  const [showScope, setShowScope] = React.useState(true)
  return (
    <AnalystProvider hasAIKey configuredProviders={[]} defaultAIProvider="anthropic" fundName="Fund">
      {showScope && <AnalystDiligenceScope dealId={diligenceDealId} dealName="Laconia" />}
      <DiligenceProbe />
      <button type="button" onClick={() => setShowScope(false)}>leave diligence</button>
    </AnalystProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

function mockViewport(width: number) {
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.includes('1280px') ? width >= 1280 : width >= 1024,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

function mockResponsiveViewport(initialWidth: number) {
  let width = initialWidth
  const queries: Array<{ query: string; listeners: Set<(event: MediaQueryListEvent) => void> }> = []
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    queries.push({ query, listeners })
    return {
      get matches() { return query.includes('1280px') ? width >= 1280 : width >= 1024 },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
  }))
  return {
    setWidth(nextWidth: number) {
      width = nextWidth
      vi.stubGlobal('innerWidth', width)
      for (const item of queries) {
        const matches = item.query.includes('1280px') ? width >= 1280 : width >= 1024
        for (const listener of Array.from(item.listeners)) listener({ matches } as MediaQueryListEvent)
      }
      window.dispatchEvent(new Event('resize'))
    },
  }
}

describe('docked global assistant host', () => {
  it('uses a right-edge launcher, wraps shell content, and restores launcher focus after close', async () => {
    const user = userEvent.setup()
    render(<Surface />)

    const host = screen.getByTestId('assistant-responsive-host')
    const launcher = screen.getByTestId('assistant-edge-launcher')
    expect(host.contains(screen.getByTestId('shell-content'))).toBe(true)

    await user.click(launcher)
    expect(screen.getByTestId('open-state').textContent).toBe('true')
    expect(host.className).toContain('xl:max-w-[1680px]')
    await user.click(screen.getByRole('button', { name: 'close probe' }))

    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('assistant-edge-launcher')))
  })

  it('turns the full right edge into a valid drop target and adds context without sending', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<Surface withAction />)

    const values = new Map<string, string>()
    const handle = screen.getByTestId('assistant-drag-handle')
    fireEvent.dragStart(handle, {
      dataTransfer: {
        effectAllowed: 'none',
        setData: (type: string, value: string) => values.set(type, value),
      },
    })

    fireEvent.dragEnter(window, { dataTransfer: { types: [ASSISTANT_CONTEXT_MIME] } })
    const dropZone = screen.getByTestId('assistant-edge-drop-zone')
    expect(dropZone.className).toContain('inset-y-0')

    fireEvent.drop(dropZone, {
      dataTransfer: {
        types: [ASSISTANT_CONTEXT_MIME],
        getData: (type: string) => values.get(type) ?? '',
      },
    })

    expect(screen.getByTestId('active-contexts').textContent).toBe('feed-1')
    expect(screen.getByTestId('open-state').textContent).toBe('true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores foreign drag content', () => {
    render(<Surface />)
    fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'] } })
    expect(screen.queryByTestId('assistant-edge-drop-zone')).toBeNull()
  })
})

describe('diligence project scope', () => {
  it('sets and clears the project atomically with one reset per scope transition', async () => {
    const user = userEvent.setup()
    render(<DiligenceSurface />)

    await waitFor(() => expect(screen.getByTestId('diligence-domain').textContent).toBe('diligence'))
    expect(screen.getByTestId('diligence-deal-id').textContent).toBe(diligenceDealId)
    expect(screen.getByTestId('diligence-project-name').textContent).toBe('Laconia')
    expect(screen.getByTestId('diligence-scope-revision').textContent).toBe('1')

    await user.click(screen.getByRole('button', { name: 'leave diligence' }))
    await waitFor(() => expect(screen.getByTestId('diligence-domain').textContent).toBe(''))
    expect(screen.getByTestId('diligence-deal-id').textContent).toBe('')
    expect(screen.getByTestId('diligence-project-name').textContent).toBe('')
    expect(screen.getByTestId('diligence-scope-revision').textContent).toBe('2')
  })

  it('lists history by diligence scope instead of the inbound deal foreign key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ conversations: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<DiligenceSurface />)

    await waitFor(() => expect(screen.getByTestId('diligence-domain').textContent).toBe('diligence'))
    await user.click(screen.getByRole('button', { name: 'load project history' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    expect(requestUrl.searchParams.get('scope')).toBe(`diligence:${diligenceDealId}`)
    expect(requestUrl.searchParams.get('portfolio')).toBe('true')
    expect(requestUrl.searchParams.has('dealId')).toBe(false)
  })

  it('loads legacy shared Q&A without adopting its virtual id for follow-up writes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        conversation: {
          id: `legacy-diligence:${diligenceDealId}`,
          read_only: true,
          messages: [
            { role: 'user', content: 'Legacy question' },
            { role: 'assistant', content: 'Legacy answer' },
          ],
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<DiligenceSurface />)

    await waitFor(() => expect(screen.getByTestId('diligence-domain').textContent).toBe('diligence'))
    await user.click(screen.getByRole('button', { name: 'load legacy history' }))
    await waitFor(() => expect(screen.getByTestId('diligence-messages').textContent).toBe('Legacy question|Legacy answer'))

    expect(screen.getByTestId('diligence-conversation-id').textContent).toBe('')
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    expect(requestUrl.pathname).toBe(`/api/analyst/conversations/legacy-diligence:${diligenceDealId}`)
    expect(requestUrl.searchParams.get('scope')).toBe(`diligence:${diligenceDealId}`)
  })
})

describe('responsive assistant panel surface', () => {
  it('renders a resizable 400px desktop dock with bounded keyboard controls', async () => {
    mockViewport(1440)
    const user = userEvent.setup()
    render(
      <MobileDrawerPanel open onOpenChange={vi.fn()} desktopMode="docked" dialogTitle="Assistant" dialogDescription="Assistant panel">
        <textarea aria-label="Prompt" />
      </MobileDrawerPanel>
    )

    const dock = await screen.findByTestId('assistant-desktop-dock')
    const resizer = screen.getByTestId('assistant-dock-resizer')
    expect(dock.style.width).toBe('400px')
    expect(resizer.getAttribute('role')).toBe('separator')
    expect(resizer.getAttribute('aria-orientation')).toBe('vertical')

    resizer.focus()
    await user.keyboard('{ArrowLeft}')
    expect(dock.style.width).toBe('416px')
    await user.keyboard('{Home}')
    expect(dock.style.width).toBe('320px')
    await user.keyboard('{End}')
    expect(dock.style.width).toBe('560px')
  })

  it('keeps tablet and mobile presentations in the right-side drawer', async () => {
    mockViewport(1024)
    render(
      <MobileDrawerPanel open onOpenChange={vi.fn()} desktopMode="docked" dialogTitle="Assistant" dialogDescription="Assistant panel">
        <div>Tablet content</div>
      </MobileDrawerPanel>
    )

    expect((await screen.findByRole('dialog')).className).toContain('md:w-[400px]')
    expect(screen.queryByTestId('assistant-desktop-dock')).toBeNull()

    cleanup()
    mockViewport(390)
    render(
      <MobileDrawerPanel open onOpenChange={vi.fn()} desktopMode="docked" dialogTitle="Assistant" dialogDescription="Assistant panel">
        <div>Mobile content</div>
      </MobileDrawerPanel>
    )
    expect((await screen.findByRole('dialog')).className).toContain('w-[calc(100vw-1rem)]')
  })

  it('preserves the desktop width while crossing into drawer mode', async () => {
    const viewport = mockResponsiveViewport(1440)
    const user = userEvent.setup()
    render(
      <MobileDrawerPanel open onOpenChange={vi.fn()} desktopMode="docked" dialogTitle="Assistant" dialogDescription="Assistant panel">
        <textarea aria-label="Prompt" />
      </MobileDrawerPanel>
    )

    const dock = await screen.findByTestId('assistant-desktop-dock')
    const resizer = screen.getByTestId('assistant-dock-resizer')
    resizer.focus()
    await user.keyboard('{ArrowLeft}')
    expect(dock.style.width).toBe('416px')
    await waitFor(() => expect(window.localStorage.getItem('reporting:analyst-dock-width')).toBe('416'))

    act(() => viewport.setWidth(1024))
    await screen.findByRole('dialog')
    expect(window.localStorage.getItem('reporting:analyst-dock-width')).toBe('416')

    act(() => viewport.setWidth(1440))
    expect((await screen.findByTestId('assistant-desktop-dock')).style.width).toBe('416px')
  })

  it('keeps the default width when browser storage is unavailable', async () => {
    mockViewport(1440)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })

    render(
      <MobileDrawerPanel open onOpenChange={vi.fn()} desktopMode="docked" dialogTitle="Assistant" dialogDescription="Assistant panel">
        <div>Content</div>
      </MobileDrawerPanel>
    )

    expect((await screen.findByTestId('assistant-desktop-dock')).style.width).toBe('400px')
  })
})
