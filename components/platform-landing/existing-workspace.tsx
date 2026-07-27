'use client'

import React from 'react'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { workspaceAuthUrlForInput } from '@/lib/platform-landing/workspace-entry'
import { cn } from '@/lib/utils'

export function ExistingWorkspace({
  platformOrigin,
  navigate = url => window.location.assign(url),
  className,
}: {
  readonly platformOrigin: string
  readonly navigate?: (url: string) => void
  readonly className?: string
}) {
  const t = useTranslations('PlatformLanding.workspace')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const url = workspaceAuthUrlForInput(platformOrigin, value)
    if (!url) {
      setError(t('error'))
      return
    }
    setError(null)
    navigate(url)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex min-h-11 items-center justify-center gap-2 border-b border-current px-1 py-2 text-sm font-semibold text-[#17221f] transition-colors hover:text-[#1656a3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1656a3] focus-visible:ring-offset-4',
            className,
          )}
        >
          {t('trigger')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={t('close')} className="border-[#c9c3b7] bg-[#f8f5ee] text-[#17221f] shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-normal">{t('title')}</DialogTitle>
          <DialogDescription className="leading-6 text-[#5d655f]">{t('description')}</DialogDescription>
        </DialogHeader>
        <form className="mt-2 space-y-4" onSubmit={submit} noValidate>
          <div className="space-y-2">
            <label htmlFor="platform-workspace" className="text-sm font-semibold">{t('label')}</label>
            <input
              id="platform-workspace"
              value={value}
              onChange={event => {
                setValue(event.target.value)
                if (error) setError(null)
              }}
              autoComplete="organization"
              inputMode="url"
              placeholder={t('placeholder')}
              aria-describedby="platform-workspace-help platform-workspace-error"
              aria-invalid={Boolean(error)}
              className="min-h-12 w-full border border-[#a9ada8] bg-white px-4 text-base outline-none transition-colors placeholder:text-[#6b716c] focus:border-[#1656a3] focus:ring-2 focus:ring-[#1656a3]/20"
            />
            <p id="platform-workspace-help" className="text-xs leading-5 text-[#5c625e]">{t('help')}</p>
            <p id="platform-workspace-error" role={error ? 'alert' : undefined} className="min-h-5 text-sm text-[#a13b2d]">
              {error}
            </p>
          </div>
          <button
            type="submit"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[#17221f] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1656a3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1656a3] focus-visible:ring-offset-2"
          >
            {t('continue')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
