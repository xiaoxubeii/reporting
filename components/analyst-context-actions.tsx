'use client'

import React, { useRef, useState, type DragEvent } from 'react'
import { Check, GripVertical, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useOptionalAnalystContext } from '@/components/analyst-context'
import { ASSISTANT_CONTEXT_MIME, type AssistantContextSnapshot } from '@/lib/analyst/context-snapshot'

type AnalystContextActionsPresentation = 'default' | 'compact-hover'

export function AnalystContextActions({ snapshot, className = '', presentation = 'default' }: {
  snapshot: AssistantContextSnapshot
  className?: string
  presentation?: AnalystContextActionsPresentation
}) {
  const t = useTranslations('Analyst')
  const analyst = useOptionalAnalystContext()
  const [error, setError] = useState(false)
  const dragToken = useRef<string | null>(null)
  const selected = analyst?.activeContexts.some(item => item.version === snapshot.version && item.kind === snapshot.kind && item.id === snapshot.id) ?? false
  const compactHover = presentation === 'compact-hover'

  if (!analyst?.hasAIKey) return null
  const activeAnalyst = analyst

  function add() {
    const result = activeAnalyst.addContext(snapshot)
    if (result === 'limit') {
      setError(true)
      return
    }
    setError(false)
    activeAnalyst.openPanel()
  }

  function drag(event: DragEvent<HTMLElement>) {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'copy'
    const token = activeAnalyst.registerDragContext(snapshot)
    dragToken.current = token
    event.dataTransfer.setData(ASSISTANT_CONTEXT_MIME, token)
  }

  function endDrag() {
    if (!dragToken.current) return
    activeAnalyst.revokeDragContext(dragToken.current)
    dragToken.current = null
  }

  return (
    <div
      className={`inline-flex items-center gap-1 ${compactHover && !selected ? '[@media(hover:hover)_and_(pointer:fine)]:pointer-events-none [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:transition-opacity [@media(hover:hover)_and_(pointer:fine)]:group-hover:pointer-events-auto [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-focus-within:pointer-events-auto [@media(hover:hover)_and_(pointer:fine)]:group-focus-within:opacity-100' : ''} ${className}`}
      onClick={event => event.stopPropagation()}
    >
      {error && <span role="alert" className="text-[10px] text-destructive">{t('context.limit')}</span>}
      <button
        data-testid="assistant-drag-handle"
        data-context-id={`${snapshot.kind}:${snapshot.id}`}
        type="button"
        draggable
        onDragStart={drag}
        onDragEnd={endDrag}
        onClick={add}
        className={`inline-flex min-h-9 cursor-grab items-center gap-1 rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing ${compactHover ? 'h-9 w-9 justify-center p-0' : 'px-2 py-1 md:min-h-0 md:px-1.5'}`}
        aria-label={selected ? t('context.added') : t('context.add')}
        aria-pressed={selected}
        title={error ? t('context.limit') : selected ? t('context.added') : t('context.drag')}
      >
        {selected ? (
          <Check className={compactHover ? 'h-4 w-4 text-primary' : 'h-3.5 w-3.5 text-primary'} />
        ) : (
          <>
            <GripVertical className={compactHover ? 'hidden h-4 w-4 md:block' : 'hidden h-3.5 w-3.5 md:block'} />
            <Plus className={compactHover ? 'h-4 w-4 md:hidden' : 'h-3.5 w-3.5 md:hidden'} />
          </>
        )}
        {!compactHover && (selected ? (
          <span>{t('context.added')}</span>
        ) : (
          <>
            <span className="hidden md:inline">{t('context.drag')}</span>
            <span className="md:hidden">{t('context.send')}</span>
          </>
        ))}
      </button>
    </div>
  )
}
