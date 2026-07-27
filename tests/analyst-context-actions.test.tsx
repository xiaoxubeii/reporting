// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalystContextActions } from '@/components/analyst-context-actions'
import { AnalystProvider, useAnalystContext } from '@/components/analyst-context'
import { ASSISTANT_CONTEXT_MIME, type AssistantContextSnapshot } from '@/lib/analyst/context-snapshot'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const snapshot: AssistantContextSnapshot = Object.freeze({
  version: 1,
  id: 'result-1',
  kind: 'search_result',
  title: 'Cardiovascular AI',
  text: 'A visible result snippet.',
  sourceLabel: 'PubMed',
  sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
  capturedAt: '2026-07-26T12:00:00.000Z',
})

function Probe() {
  const { activeContexts, startNewConversation, open } = useAnalystContext()
  return <><output data-testid="active">{activeContexts.map(item => item.id).join(',')}</output><output data-testid="open">{String(open)}</output><button onClick={startNewConversation}>new</button></>
}

function Surface() {
  return <AnalystProvider hasAIKey configuredProviders={[]} defaultAIProvider="anthropic" fundName="Fund"><AnalystContextActions snapshot={snapshot} /><Probe /></AnalystProvider>
}

function CompactSurface() {
  return <AnalystProvider hasAIKey configuredProviders={[]} defaultAIProvider="anthropic" fundName="Fund"><div className="group"><AnalystContextActions snapshot={snapshot} presentation="compact-hover" /></div><Probe /></AnalystProvider>
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Analyst context source actions', () => {
  it('adds with keyboard/touch action, deduplicates, never auto-sends, and clears for a new conversation', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<Surface />)

    await user.click(screen.getByRole('button', { name: 'context.add' }))
    expect(screen.getByTestId('active').textContent).toBe('result-1')
    expect(screen.getByTestId('open').textContent).toBe('true')
    await user.click(screen.getByRole('button', { name: 'context.added' }))
    expect(screen.getByTestId('active').textContent).toBe('result-1')
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'new' }))
    expect(screen.getByTestId('active').textContent).toBe('')
  })

  it('reports the context limit without throwing or changing the selected set', async () => {
    const user = userEvent.setup()
    function ManyActions() {
      return (
        <AnalystProvider hasAIKey configuredProviders={[]} defaultAIProvider="anthropic" fundName="Fund">
          {Array.from({ length: 6 }, (_, index) => (
            <AnalystContextActions key={index} snapshot={{ ...snapshot, id: `result-${index}` }} />
          ))}
          <Probe />
        </AnalystProvider>
      )
    }
    render(<ManyActions />)

    for (const button of screen.getAllByRole('button', { name: 'context.add' }).slice(0, 5)) {
      await user.click(button)
    }
    await user.click(screen.getAllByRole('button', { name: 'context.add' })[0])

    expect(screen.getByTestId('active').textContent?.split(',')).toHaveLength(5)
    expect(screen.getByRole('alert').textContent).toBe('context.limit')
  })

  it('puts only an opaque token in the dedicated drag MIME type', () => {
    render(<Surface />)
    const handle = document.querySelector('[title="context.drag"]') as HTMLElement
    const values = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'none',
      setData: vi.fn((type: string, value: string) => values.set(type, value)),
    }

    fireEvent.dragStart(handle, { dataTransfer })

    expect(dataTransfer.setData).toHaveBeenCalledOnce()
    const token = values.get(ASSISTANT_CONTEXT_MIME)
    expect(token).toBeTruthy()
    expect(token).not.toContain(snapshot.id)
    expect(token).not.toContain(snapshot.text)
    expect(values.has('text/plain')).toBe(false)
  })

  it('exposes distinct desktop drag and mobile send labels on the same accessible action', () => {
    render(<Surface />)

    expect(screen.getByText('context.drag').className).toContain('hidden')
    expect(screen.getByText('context.drag').className).toContain('md:inline')
    expect(screen.getByText('context.send').className).toContain('md:hidden')
    expect(screen.getByRole('button', { name: 'context.add' }).getAttribute('draggable')).toBe('true')
  })

  it('uses an icon-only Feed affordance revealed by desktop row hover or focus', async () => {
    const user = userEvent.setup()
    render(<CompactSurface />)

    const handle = screen.getByRole('button', { name: 'context.add' })
    const wrapper = handle.parentElement as HTMLElement

    expect(handle.textContent).toBe('')
    expect(handle.getAttribute('draggable')).toBe('true')
    expect(handle.getAttribute('title')).toBe('context.drag')
    expect(handle.className).toContain('h-9')
    expect(handle.className).toContain('w-9')
    expect(handle.className).not.toContain('md:h-8')
    expect(handle.className).not.toContain('md:w-8')
    expect(handle.querySelector('svg')?.getAttribute('class')).toContain('h-4 w-4')
    expect(wrapper.className).toContain('[@media(hover:hover)_and_(pointer:fine)]:opacity-0')
    expect(wrapper.className).toContain('[@media(hover:hover)_and_(pointer:fine)]:pointer-events-none')
    expect(wrapper.className).toContain('[@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100')
    expect(wrapper.className).toContain('[@media(hover:hover)_and_(pointer:fine)]:group-hover:pointer-events-auto')
    expect(wrapper.className).toContain('[@media(hover:hover)_and_(pointer:fine)]:group-focus-within:opacity-100')

    await user.click(handle)

    const selectedHandle = screen.getByRole('button', { name: 'context.added' })
    expect(selectedHandle.textContent).toBe('')
    expect(selectedHandle.querySelector('svg')?.getAttribute('class')).toContain('h-4 w-4')
    expect(wrapper.className).not.toContain('[@media(hover:hover)_and_(pointer:fine)]:opacity-0')
  })
})
