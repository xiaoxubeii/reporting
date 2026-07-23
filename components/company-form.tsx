'use client'

import { useState, KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { X } from 'lucide-react'
import type { Company } from '@/lib/types/database'
import { useTranslations } from 'next-intl'

interface Props {
  company?: Company
  initialName?: string
  onSuccess: (company: Company) => void
  onCancel: () => void
}

export function CompanyForm({ company, initialName, onSuccess, onCancel }: Props) {
  const t = useTranslations('SharedForms.company')
  const isEdit = !!company

  const [name, setName] = useState(company?.name ?? initialName ?? '')
  const [aliases, setAliases] = useState<string[]>(company?.aliases ?? [])
  const [aliasInput, setAliasInput] = useState('')
  const [stage, setStage] = useState(company?.stage ?? '')
  const [industries, setIndustries] = useState<string[]>(company?.industry ?? [])
  const [industryInput, setIndustryInput] = useState('')
  const [tags, setTags] = useState<string[]>(company?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [portfolioGroups, setPortfolioGroups] = useState<string[]>(company?.portfolio_group ?? [])
  const [portfolioGroupInput, setPortfolioGroupInput] = useState('')
  const [notes, setNotes] = useState(company?.notes ?? '')
  const [overview, setOverview] = useState(company?.overview ?? '')
  const [founders, setFounders] = useState(company?.founders ?? '')
  const [whyInvested, setWhyInvested] = useState(company?.why_invested ?? '')
  const [currentUpdate, setCurrentUpdate] = useState(company?.current_update ?? '')
  const [contactEmails, setContactEmails] = useState<string[]>(company?.contact_email ?? [])
  const [contactEmailInput, setContactEmailInput] = useState('')
  const [status, setStatus] = useState(company?.status ?? 'active')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addTag() {
    const trimmed = tagInput.trim()
    if (!trimmed || tags.includes(trimmed)) return
    setTags(prev => [...prev, trimmed])
    setTagInput('')
  }

  function removeTag(tag: string) {
    setTags(prev => prev.filter(t => t !== tag))
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  function addIndustry() {
    const trimmed = industryInput.trim()
    if (!trimmed || industries.includes(trimmed)) return
    setIndustries(prev => [...prev, trimmed])
    setIndustryInput('')
  }

  function removeIndustry(val: string) {
    setIndustries(prev => prev.filter(v => v !== val))
  }

  function handleIndustryKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); addIndustry() }
  }

  function addPortfolioGroup() {
    const trimmed = portfolioGroupInput.trim()
    if (!trimmed || portfolioGroups.includes(trimmed)) return
    setPortfolioGroups(prev => [...prev, trimmed])
    setPortfolioGroupInput('')
  }

  function removePortfolioGroup(val: string) {
    setPortfolioGroups(prev => prev.filter(v => v !== val))
  }

  function handlePortfolioGroupKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); addPortfolioGroup() }
  }

  function addContactEmail() {
    const trimmed = contactEmailInput.trim()
    if (!trimmed || contactEmails.includes(trimmed)) return
    setContactEmails(prev => [...prev, trimmed])
    setContactEmailInput('')
  }

  function removeContactEmail(val: string) {
    setContactEmails(prev => prev.filter(v => v !== val))
  }

  function handleContactEmailKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); addContactEmail() }
  }

  function addAlias() {
    const trimmed = aliasInput.trim()
    if (!trimmed || aliases.includes(trimmed)) return
    setAliases(prev => [...prev, trimmed])
    setAliasInput('')
  }

  function removeAlias(alias: string) {
    setAliases(prev => prev.filter(a => a !== alias))
  }

  function handleAliasKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addAlias()
    }
  }

  async function submit() {
    if (!name.trim()) {
      setError(t('errors.nameRequired'))
      return
    }
    setError(null)
    setSaving(true)

    try {
      const url = isEdit ? `/api/companies/${company.id}` : '/api/companies'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          aliases: aliases.length > 0 ? aliases : null,
          tags: tags.length > 0 ? tags : [],
          stage: stage.trim() || null,
          industry: industries.length > 0 ? industries : null,
          notes: notes.trim() || null,
          overview: overview.trim() || null,
          founders: founders.trim() || null,
          why_invested: whyInvested.trim() || null,
          current_update: currentUpdate.trim() || null,
          contact_email: contactEmails.length > 0 ? contactEmails : null,
          portfolio_group: portfolioGroups.length > 0 ? portfolioGroups : null,
          ...(isEdit ? { status } : {}),
        }),
      })

      const text = await res.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(t('errors.invalidResponse', { status: res.status }))
      }
      if (!res.ok) throw new Error(data.error ?? t('errors.generic'))
      onSuccess(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="company-name">{t('name')}</Label>
        <Input
          id="company-name"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('aliases')}</Label>
        {aliases.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {aliases.map(alias => (
              <Badge key={alias} variant="secondary" className="gap-1 pr-1">
                {alias}
                <button
                  type="button"
                  onClick={() => removeAlias(alias)}
                  className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                  aria-label={t('removeAlias', { value: alias })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          placeholder={t('aliasPlaceholder')}
          value={aliasInput}
          onChange={e => setAliasInput(e.target.value)}
          onKeyDown={handleAliasKeyDown}
          onBlur={addAlias}
        />
        <p className="text-xs text-muted-foreground">
          {t('aliasHelp')}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t('tags')}</Label>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map(tag => (
              <Badge key={tag} variant="outline" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                  aria-label={t('removeTag', { value: tag })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          placeholder={t('tagPlaceholder')}
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          onBlur={addTag}
        />
        <p className="text-xs text-muted-foreground">
          {t('tagHelp')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stage">{t('stage')}</Label>
        <Input
          id="stage"
          placeholder={t('stagePlaceholder')}
          value={stage}
          onChange={e => setStage(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('industry')}</Label>
        {industries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {industries.map(val => (
              <Badge key={val} variant="outline" className="gap-1 pr-1">
                {val}
                <button
                  type="button"
                  onClick={() => removeIndustry(val)}
                  className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                  aria-label={t('removeIndustry', { value: val })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          placeholder={t('industryPlaceholder')}
          value={industryInput}
          onChange={e => setIndustryInput(e.target.value)}
          onKeyDown={handleIndustryKeyDown}
          onBlur={addIndustry}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('portfolioGroup')}</Label>
        {portfolioGroups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {portfolioGroups.map(val => (
              <Badge key={val} variant="outline" className="gap-1 pr-1">
                {val}
                <button
                  type="button"
                  onClick={() => removePortfolioGroup(val)}
                  className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                  aria-label={t('removePortfolioGroup', { value: val })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          placeholder={t('portfolioGroupPlaceholder')}
          value={portfolioGroupInput}
          onChange={e => setPortfolioGroupInput(e.target.value)}
          onKeyDown={handlePortfolioGroupKeyDown}
          onBlur={addPortfolioGroup}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="founders">{t('founders')}</Label>
        <Input
          id="founders"
          placeholder={t('foundersPlaceholder')}
          value={founders}
          onChange={e => setFounders(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('contactEmails')}</Label>
        {contactEmails.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {contactEmails.map(val => (
              <Badge key={val} variant="outline" className="gap-1 pr-1">
                {val}
                <button
                  type="button"
                  onClick={() => removeContactEmail(val)}
                  className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                  aria-label={t('removeContactEmail', { value: val })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          type="email"
          placeholder={t('contactEmailPlaceholder')}
          value={contactEmailInput}
          onChange={e => setContactEmailInput(e.target.value)}
          onKeyDown={handleContactEmailKeyDown}
          onBlur={addContactEmail}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="overview">{t('overview')}</Label>
        <Textarea
          id="overview"
          placeholder={t('overviewPlaceholder')}
          value={overview}
          onChange={e => setOverview(e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="why-invested">{t('whyInvested')}</Label>
        <Textarea
          id="why-invested"
          placeholder={t('whyInvestedPlaceholder')}
          value={whyInvested}
          onChange={e => setWhyInvested(e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="current-update">{t('currentUpdate')}</Label>
        <Textarea
          id="current-update"
          placeholder={t('currentUpdatePlaceholder')}
          value={currentUpdate}
          onChange={e => setCurrentUpdate(e.target.value)}
          rows={2}
        />
      </div>

      {isEdit && (
        <div className="space-y-2">
          <Label>{t('status')}</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t('statuses.active')}</SelectItem>
              <SelectItem value="exited">{t('statuses.exited')}</SelectItem>
              <SelectItem value="written-off">{t('statuses.writtenOff')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">{t('notes')}</Label>
        <Textarea
          id="notes"
          placeholder={t('notesPlaceholder')}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          {t('cancel')}
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? t('saving') : isEdit ? t('saveChanges') : t('addCompany')}
        </Button>
      </div>
    </div>
  )
}
