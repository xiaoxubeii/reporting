'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useTranslations } from 'next-intl'

interface FiltersSheetProps {
  children: React.ReactNode
  activeCount?: number
}

export function FiltersSheet({ children, activeCount }: FiltersSheetProps) {
  const t = useTranslations('SharedForms.filters')
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4 mr-1.5" />
        {t('title')}
        {!!activeCount && activeCount > 0 && (
          <span className="ml-1.5 rounded-full bg-foreground text-background text-[10px] px-1.5 py-0.5 leading-none font-medium">{activeCount}</span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[320px] max-w-[85vw]">
          <h3 className="text-lg font-semibold mb-6">{t('title')}</h3>
          <div className="space-y-4">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
