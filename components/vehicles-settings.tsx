'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsCard, SettingsCardGrid, SettingsField } from '@/components/settings-card'

interface Vehicle { id: string; name: string; kind: string; aliases: string[]; active: boolean; serves_vehicle_id?: string | null; lp_entity_id?: string | null; vintage_year?: number | null }
interface LpEntity { id: string; entity_name: string }

const KINDS = ['fund', 'spv', 'direct', 'associate', 'other'] as const

/** Fund-wide management of investment vehicles (the fund_vehicles registry). */
export function VehiclesSettings() {
  const t = useTranslations('Settings.vehicles')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('fund')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [entities, setEntities] = useState<LpEntity[]>([])

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/vehicles')
      .then(r => {
        if (!r.ok) throw new Error('load failed')
        return r.json()
      })
      .then(d => setVehicles(Array.isArray(d) ? d : []))
      .catch(() => setError(t('errors.load')))
      .finally(() => setLoading(false))
  }, [t])
  useEffect(() => { load() }, [load])

  // The partners an associate could be, on the fund's books.
  useEffect(() => {
    fetch('/api/lps/entities')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setEntities(Array.isArray(d) ? d : []))
      .catch(() => setError(t('errors.entities')))
  }, [t])

  async function create() {
    const name = newName.trim()
    if (!name) return
    setBusy(true); setError(null)
    const res = await fetch('/api/vehicles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kind: newKind }) })
    setBusy(false)
    if (res.ok) { setNewName(''); setNewKind('fund'); load() }
    else setError(t('errors.create'))
  }

  async function patch(id: string, changes: Partial<Vehicle>) {
    setVehicles(prev => prev.map(v => (v.id === id ? { ...v, ...changes } : v))) // optimistic
    const res = await fetch('/api/vehicles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...changes }) })
    if (!res.ok) { setError(t('errors.update')); load() }
  }

  // The row holds snake_case (as the DB returns it) while the API takes camelCase, so this
  // gets its own setter rather than going through `patch`, which passes keys straight through.
  async function setVintage(id: string, vintageYear: number | null) {
    setVehicles(prev => prev.map(v => (v.id === id ? { ...v, vintage_year: vintageYear } : v)))
    const res = await fetch('/api/vehicles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, vintageYear }) })
    if (!res.ok) { setError(t('errors.update')); load() }
  }

  // Link a GP/associate entity to the fund vehicle it serves.
  async function setServes(id: string, servesVehicleId: string | null) {
    setVehicles(prev => prev.map(v => (v.id === id ? { ...v, serves_vehicle_id: servesVehicleId } : v)))
    const res = await fetch('/api/vehicles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, servesVehicleId }) })
    if (!res.ok) { setError(t('errors.update')); load() }
  }

  // …and AS WHOM it holds that position. The look-through needs both halves: which fund the
  // associate invests in, and which partner on that fund's books represents it. With only the
  // first, an associate's members never reach the LP report at all.
  async function setLpEntity(id: string, lpEntityId: string | null) {
    setVehicles(prev => prev.map(v => (v.id === id ? { ...v, lp_entity_id: lpEntityId } : v)))
    const res = await fetch('/api/vehicles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, lpEntityId }) })
    if (!res.ok) { setError(t('errors.update')); load() }
  }

  // Rename cascades the string across all the data server-side, so reload after.
  async function rename(id: string) {
    const name = editName.trim()
    if (!name) return
    setBusy(true); setError(null)
    const res = await fetch('/api/vehicles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name }) })
    setBusy(false)
    if (res.ok) { setEditingId(null); setEditName(''); load() }
    else setError(t('errors.rename'))
  }

  const kindLabels: Record<(typeof KINDS)[number], string> = {
    fund: t('kinds.fund'),
    spv: t('kinds.spv'),
    direct: t('kinds.direct'),
    associate: t('kinds.associate'),
    other: t('kinds.other'),
  }

  return (
    <>
      <p className="mb-4 text-xs text-muted-foreground">
        {t('description')}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('loading')}</div>
      ) : vehicles.length === 0 ? (
        <div className="rounded-md border px-3 py-4 text-xs text-muted-foreground">{t('empty')}</div>
      ) : (
        <SettingsCardGrid>
          {vehicles.map(v => (
            <SettingsCard
              key={v.id}
              muted={!v.active}
              title={
                editingId === v.id ? (
                  <div className="flex items-center gap-2">
                    <Input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') rename(v.id); if (e.key === 'Escape') { setEditingId(null); setError(null) } }}
                      aria-label={t('editNameLabel')}
                      className="h-7 text-sm" />
                    <button onClick={() => rename(v.id)} disabled={busy || !editName.trim()} className="shrink-0 text-xs text-primary hover:underline disabled:opacity-50">{busy ? t('saving') : t('save')}</button>
                    <button onClick={() => { setEditingId(null); setError(null) }} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">{t('cancel')}</button>
                  </div>
                ) : (
                  <span className={v.active ? '' : 'line-through'} title={v.name}>{v.name}</span>
                )
              }
              subtitle={editingId !== v.id && v.aliases?.length > 0 ? t('aliases', { aliases: v.aliases.join(', ') }) : undefined}
              aside={
                editingId === v.id ? undefined : (
                  <>
                    <button onClick={() => { setEditingId(v.id); setEditName(v.name) }} className="text-xs text-muted-foreground hover:text-foreground">{t('rename')}</button>
                    <button onClick={() => patch(v.id, { active: !v.active })} className="text-xs text-muted-foreground hover:text-foreground">
                      {v.active ? t('deactivate') : t('reactivate')}
                    </button>
                  </>
                )
              }
            >
              <div className="grid grid-cols-2 gap-2">
                <SettingsField label={t('type')}>
                  <select value={v.kind} onChange={e => patch(v.id, { kind: e.target.value })} aria-label={t('type')} className="h-7 w-full rounded border border-input bg-transparent px-1.5 text-xs">
                    {KINDS.map(kind => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}
                  </select>
                </SettingsField>
                {/* Vintage year. Nothing derives it, so it has to be stated — unlike carry
                    rate and GP-commit %, which used to sit beside it on fund_group_config and
                    are now obsolete (real waterfall terms; real accrued carry). */}
                <SettingsField label={t('vintage')}>
                  <VintageInput value={v.vintage_year ?? null} onSave={y => setVintage(v.id, y)} />
                </SettingsField>
              </div>

              {v.kind === 'associate' && (
                <div className="mt-2 grid gap-2">
                  {/* Both halves of the look-through link. The labels carry the words the options
                      used to repeat ("GP of Bluefish SPV LP" in a 160px select), so the option
                      only has to name the thing — and stops truncating. */}
                  <SettingsField label={t('gpOf')}>
                    <select
                      value={v.serves_vehicle_id ?? ''}
                      onChange={e => setServes(v.id, e.target.value || null)}
                      title={t('gpOfTitle')}
                      aria-label={t('gpOf')}
                      className="h-7 w-full rounded border border-input bg-transparent px-1.5 text-xs"
                    >
                      <option value="">{t('notSet')}</option>
                      {vehicles.filter(o => o.kind !== 'associate' && o.id !== v.id).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </SettingsField>
                  {/* Without this the look-through can't run: we know WHICH fund the associate
                      invests in, but not AS WHOM — and so its members never appear in the LP
                      report at all. Hence the amber border when the first half is set alone. */}
                  <SettingsField label={t('investsAs')}>
                    <select
                      value={v.lp_entity_id ?? ''}
                      onChange={e => setLpEntity(v.id, e.target.value || null)}
                      title={t('investsAsTitle')}
                      aria-label={t('investsAs')}
                      className={`h-7 w-full rounded border bg-transparent px-1.5 text-xs ${
                        v.serves_vehicle_id && !v.lp_entity_id ? 'border-amber-500 text-amber-600' : 'border-input'
                      }`}
                    >
                      <option value="">{t('notSet')}</option>
                      {entities.map(e => <option key={e.id} value={e.id}>{e.entity_name}</option>)}
                    </select>
                  </SettingsField>
                </div>
              )}
            </SettingsCard>
          ))}
        </SettingsCardGrid>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create() }} placeholder={t('newNamePlaceholder')} aria-label={t('newNameLabel')} className="h-8 max-w-[260px] text-sm" />
        <select value={newKind} onChange={e => setNewKind(e.target.value)} aria-label={t('newTypeLabel')} className="h-8 rounded border border-input bg-background px-2 text-sm">
          {KINDS.map(kind => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={create} disabled={busy || !newName.trim()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}{t('add')}
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </>
  )
}

/** Vintage year — saves on blur, clears when emptied. */
function VintageInput({ value, onSave }: { value: number | null; onSave: (y: number | null) => void }) {
  const t = useTranslations('Settings.vehicles')
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => { setDraft(value == null ? '' : String(value)) }, [value])

  return (
    <Input
      value={draft}
      onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
      onBlur={() => {
        const next = draft === '' ? null : Number(draft)
        if (next !== value) onSave(next)
      }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder="—"
      title={t('vintageTitle')}
      aria-label={t('vintageTitle')}
      inputMode="numeric"
      className="h-7 w-full text-xs"
    />
  )
}
