'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { SchemaEditor } from './[name]/schema-editor'

const SCHEMA_ORDER = [
  'rubric', 'qa_library', 'data_room_ingestion', 'research_dossier', 'memo_output', 'style_anchors', 'instructions',
] as const

interface ActiveSchema {
  schema_version: string
  yaml_content: string
}

/**
 * Inline (settings-page) variant of the schemas list+editor. The list endpoint
 * already returns each active schema's yaml_content, so expanding a row renders
 * the full SchemaEditor without a second fetch.
 */
export function SchemasInline() {
  const t = useTranslations('Settings.schemas')
  const [schemas, setSchemas] = useState<Record<string, ActiveSchema> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openName, setOpenName] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/firm/schemas')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then(b => setSchemas(b.schemas ?? {}))
      .catch(() => setError(t('loadError')))
  }, [t])

  if (error) return <div className="text-xs text-destructive">{error}</div>
  if (!schemas) return <div className="text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 inline animate-spin mr-1" /> {t('loading')}</div>

  return (
    <div className="divide-y border-t">
      {SCHEMA_ORDER.map(name => {
        const row = schemas[name]
        const isOpen = openName === name
        return (
          <div key={name}>
            <button
              onClick={() => setOpenName(o => (o === name ? null : name))}
              className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t(`items.${name}.label`)}</div>
                <div className="text-xs text-muted-foreground">{t(`items.${name}.description`)}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                {row ? <span className="font-mono">{row.schema_version}</span> : <span className="italic">{t('notSeeded')}</span>}
              </div>
            </button>
            {isOpen && (
              <div className="border-t bg-muted/10 px-3 pb-4 pt-2">
                {row ? (
                  <SchemaEditor schemaName={name} initialContent={row.yaml_content ?? ''} initialVersion={row.schema_version ?? ''} embedded />
                ) : (
                  <div className="text-xs text-muted-foreground py-2">{t('seedHelp')}</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
