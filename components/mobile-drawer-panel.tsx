'use client'

import React, { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useMediaQuery } from '@/lib/hooks/use-media-query'

const DEFAULT_DOCK_WIDTH = 400
const MIN_DOCK_WIDTH = 320
const MAX_DOCK_WIDTH = 560
const MIN_CONTENT_WIDTH = 720
const DOCK_WIDTH_STORAGE_KEY = 'reporting:analyst-dock-width'

function maxDockWidth(): number {
  if (typeof window === 'undefined') return MAX_DOCK_WIDTH
  return Math.max(MIN_DOCK_WIDTH, Math.min(MAX_DOCK_WIDTH, window.innerWidth - MIN_CONTENT_WIDTH))
}

function clampDockWidth(width: number): number {
  return Math.min(maxDockWidth(), Math.max(MIN_DOCK_WIDTH, width))
}

interface MobileDrawerPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  desktopMode?: 'inline' | 'floating' | 'docked'
  dialogTitle?: string
  dialogDescription?: string
  resizeLabel?: string
}

export function MobileDrawerPanel({ open, onOpenChange, children, desktopMode = 'inline', dialogTitle, dialogDescription, resizeLabel }: MobileDrawerPanelProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isDockedDesktop = useMediaQuery('(min-width: 1280px)')
  const renderInDesktopFlow = desktopMode === 'docked' ? isDockedDesktop : isDesktop
  const [dockWidth, setDockWidth] = useState(DEFAULT_DOCK_WIDTH)
  const [dockWidthLoaded, setDockWidthLoaded] = useState(false)
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null)
  const previousDesktopModeRef = useRef(renderInDesktopFlow)

  useEffect(() => {
    if (desktopMode !== 'docked') return
    try {
      const storedWidth = Number(window.localStorage.getItem(DOCK_WIDTH_STORAGE_KEY))
      if (Number.isFinite(storedWidth) && storedWidth > 0) {
        setDockWidth(clampDockWidth(storedWidth))
      }
    } catch {
      // Restricted storage is non-fatal; the in-memory default remains usable.
    }
    setDockWidthLoaded(true)
  }, [desktopMode])

  useEffect(() => {
    if (desktopMode !== 'docked' || !dockWidthLoaded || !renderInDesktopFlow) return
    try {
      window.localStorage.setItem(DOCK_WIDTH_STORAGE_KEY, String(dockWidth))
    } catch {
      // Width persistence is an enhancement; resizing must still work without storage.
    }
  }, [desktopMode, dockWidth, dockWidthLoaded, renderInDesktopFlow])

  useEffect(() => {
    if (desktopMode !== 'docked' || !renderInDesktopFlow) return
    const constrainWidth = () => {
      // Read the viewport directly: MediaQueryList state can lag the resize event by one turn,
      // which would otherwise clamp and persist a desktop preference while entering drawer mode.
      if (window.innerWidth < 1280) return
      setDockWidth(currentWidth => clampDockWidth(currentWidth))
    }
    window.addEventListener('resize', constrainWidth)
    return () => window.removeEventListener('resize', constrainWidth)
  }, [desktopMode, renderInDesktopFlow])

  useEffect(() => {
    const changedMode = previousDesktopModeRef.current !== renderInDesktopFlow
    previousDesktopModeRef.current = renderInDesktopFlow
    if (!open || !changedMode) return

    // Radix restores focus when the Sheet unmounts. Move it back into the still-open
    // assistant after the desktop dock/drawer mode switch has committed.
    const timer = window.setTimeout(() => {
      const panel = document.querySelector<HTMLElement>('[data-testid="assistant-panel"]')
      panel?.querySelector<HTMLElement>('textarea, button, [href], [tabindex]:not([tabindex="-1"])')?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, renderInDesktopFlow])

  function handleResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    resizeStartRef.current = { x: event.clientX, width: dockWidth }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handleResizePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = resizeStartRef.current
    if (!start) return
    setDockWidth(clampDockWidth(start.width + start.x - event.clientX))
  }

  function finishResize(event: PointerEvent<HTMLDivElement>) {
    resizeStartRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setDockWidth(width => clampDockWidth(width + 16))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setDockWidth(width => clampDockWidth(width - 16))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setDockWidth(MIN_DOCK_WIDTH)
    } else if (event.key === 'End') {
      event.preventDefault()
      setDockWidth(maxDockWidth())
    }
  }

  if (renderInDesktopFlow) {
    if (!open) return null
    const desktopClassName = desktopMode === 'floating'
      ? 'fixed z-50 w-[380px] max-w-[calc(100vw-2rem)] right-[max(1.5rem,env(safe-area-inset-right))] bottom-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl'
      : desktopMode === 'docked'
        ? 'relative sticky top-0 h-dvh max-h-full shrink-0 self-start border-l bg-card shadow-xl'
        : 'w-[340px] shrink-0 sticky top-4'
    return (
      <div
        data-testid={desktopMode === 'docked' ? 'assistant-desktop-dock' : undefined}
        className={desktopClassName}
        style={desktopMode === 'docked' ? { width: dockWidth } : undefined}
        {...(desktopMode === 'floating' || desktopMode === 'docked' ? {
          role: 'dialog',
          'aria-modal': false,
          'aria-label': dialogTitle,
          onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Escape') onOpenChange(false)
          },
        } : {})}>
        {desktopMode === 'docked' && (
          <div
            data-testid="assistant-dock-resizer"
            role="separator"
            aria-label={resizeLabel ?? `Resize ${dialogTitle ?? 'panel'}`}
            aria-orientation="vertical"
            aria-valuemin={MIN_DOCK_WIDTH}
            aria-valuemax={maxDockWidth()}
            aria-valuenow={dockWidth}
            tabIndex={0}
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
            onKeyDown={handleResizeKeyDown}
            onDoubleClick={() => setDockWidth(clampDockWidth(DEFAULT_DOCK_WIDTH))}
            className="absolute inset-y-0 left-0 z-20 w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border hover:after:w-0.5 hover:after:bg-primary focus-visible:after:w-0.5 focus-visible:after:bg-primary"
          />
        )}
        {children}
      </div>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={desktopMode === 'docked'
          ? 'h-dvh w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 pt-12 md:w-[400px] md:max-w-[400px]'
          : 'p-0 pt-12 w-[340px] max-w-[85vw]'}
        dialogTitle={dialogTitle}
        dialogDescription={dialogDescription}
        onCloseAutoFocus={event => {
          if (open) event.preventDefault()
        }}
      >
        {children}
      </SheetContent>
    </Sheet>
  )
}
