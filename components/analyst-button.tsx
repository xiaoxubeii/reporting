'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useAnalystContext } from '@/components/analyst-context'

export function AnalystToggleButton() {
  const t = useTranslations('Analyst')
  const { open, toggleOpen, hasAIKey } = useAnalystContext()

  if (!hasAIKey) return null

  return (
    <Button
      variant="outline"
      size="sm"
      className={`gap-1.5 h-8 py-2 text-muted-foreground hover:text-foreground ${open ? 'bg-accent' : ''}`}
      onClick={toggleOpen}
    >
      <Sparkles className="h-3.5 w-3.5" />
      {t('title')}
    </Button>
  )
}
