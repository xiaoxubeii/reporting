'use client'

import React, { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AnalystPanel } from '@/components/analyst-panel'
import { useAnalystContext } from '@/components/analyst-context'
import { ASSISTANT_CONTEXT_MIME } from '@/lib/analyst/context-snapshot'

export function AnalystFloatingHost({ children }: { children: ReactNode }) {
  const t = useTranslations('Analyst')
  const { open, toggleOpen, hasAIKey, consumeDragContext } = useAnalystContext()
  const [dragActive, setDragActive] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(open)

  useEffect(() => {
    if (wasOpen.current && !open) launcherRef.current?.focus()
    wasOpen.current = open
  }, [open])

  useEffect(() => {
    if (!hasAIKey) return

    function activateDropTarget(event: globalThis.DragEvent) {
      if (acceptsTransfer(event.dataTransfer)) setDragActive(true)
    }
    function deactivateDropTarget() {
      setDragActive(false)
    }

    window.addEventListener('dragenter', activateDropTarget)
    window.addEventListener('dragend', deactivateDropTarget)
    window.addEventListener('drop', deactivateDropTarget)
    return () => {
      window.removeEventListener('dragenter', activateDropTarget)
      window.removeEventListener('dragend', deactivateDropTarget)
      window.removeEventListener('drop', deactivateDropTarget)
    }
  }, [hasAIKey])

  function acceptsTransfer(dataTransfer: DataTransfer | null): boolean {
    return Array.from(dataTransfer?.types ?? []).includes(ASSISTANT_CONTEXT_MIME)
  }

  function acceptsContext(event: DragEvent): boolean {
    return acceptsTransfer(event.dataTransfer)
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!acceptsContext(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!acceptsContext(event)) return
    event.preventDefault()
    setDragActive(false)
    const result = consumeDragContext(event.dataTransfer.getData(ASSISTANT_CONTEXT_MIME))
    if (result === 'limit') {
      toast.error(t('context.limit'))
    }
    if ((result === 'added' || result === 'duplicate') && !open) {
      toggleOpen()
    }
  }

  if (!hasAIKey) {
    return <div className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col">{children}</div>
  }

  return (
    <div
      data-testid="assistant-responsive-host"
      className={`mx-auto flex w-full flex-1 transition-[max-width] duration-200 ${open ? 'xl:max-w-[1680px]' : 'max-w-screen-xl'}`}
    >
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>

      {!open && !dragActive && (
        <button
          ref={launcherRef}
          data-testid="assistant-edge-launcher"
          type="button"
          onClick={toggleOpen}
          aria-label={t('openPanel')}
          title={t('openPanel')}
          className="fixed right-0 top-1/2 z-50 flex h-24 w-11 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-l-xl border border-r-0 bg-card text-foreground shadow-lg transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ paddingRight: 'env(safe-area-inset-right)' }}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="text-[10px] font-medium" style={{ writingMode: 'vertical-rl' }}>
            {t('context.edgeLabel')}
          </span>
        </button>
      )}

      {dragActive && (
        <div
          data-testid="assistant-edge-drop-zone"
          role="button"
          aria-label={t('context.dropToAdd')}
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="fixed inset-y-0 right-0 z-[60] flex w-28 items-center justify-center border-l-2 border-primary bg-primary/10 px-3 text-center text-sm font-semibold text-primary shadow-2xl backdrop-blur-sm sm:w-36"
        >
          <span className="flex flex-col items-center gap-2">
            <Sparkles className="h-6 w-6" />
            {t('context.dropToAdd')}
          </span>
        </div>
      )}

      <AnalystPanel />
    </div>
  )
}
