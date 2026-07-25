'use client'

import { FormEvent, useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Folder, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { FeedCategoryResult } from './api'

export function FollowCategoryPopover({ categories, pending, error, disabled = false, following = false, size, onFollow, onFollowingClick }: {
  categories: FeedCategoryResult[]
  pending: boolean
  error?: string
  disabled?: boolean
  following?: boolean
  size?: 'sm' | 'default'
  onFollow: (category: string | null) => Promise<boolean>
  onFollowingClick?: () => void
}) {
  const t = useTranslations('Feeds.sources')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const titleId = useId()
  const inputId = useId()
  const categoryInputRef = useRef<HTMLInputElement>(null)
  const newCategoryButtonRef = useRef<HTMLButtonElement>(null)
  const followingButtonRef = useRef<HTMLButtonElement>(null)
  const previousFollowingRef = useRef(following)
  const normalizedQuery = categoryQuery.trim().toLocaleLowerCase()
  const uncategorizedLabel = t('categoryMenu.uncategorized')
  const filteredCategories = normalizedQuery
    ? categories.filter(category => category.name.toLocaleLowerCase().includes(normalizedQuery))
    : categories
  const showUncategorized = !normalizedQuery || uncategorizedLabel.toLocaleLowerCase().includes(normalizedQuery)

  useEffect(() => {
    const becameFollowing = following && !previousFollowingRef.current
    previousFollowingRef.current = following
    if (!following) return
    setOpen(false)
    setCreating(false)
    setCategoryQuery('')
    setNewCategory('')
    if (becameFollowing) requestAnimationFrame(() => followingButtonRef.current?.focus())
  }, [following])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && pending) return
    setOpen(nextOpen)
    if (!nextOpen) {
      setCreating(false)
      setCategoryQuery('')
      setNewCategory('')
    }
  }

  async function chooseCategory(category: string | null) {
    if (pending) return
    if (await onFollow(category)) handleOpenChange(false)
  }

  async function createAndFollow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const category = newCategory.trim()
    if (!category || pending) return
    await chooseCategory(category)
  }

  function cancelCreation() {
    setCreating(false)
    setCategoryQuery('')
    setNewCategory('')
    requestAnimationFrame(() => newCategoryButtonRef.current?.focus())
  }

  function startCreation() {
    setCreating(true)
    setNewCategory('')
    setCategoryQuery('')
    requestAnimationFrame(() => categoryInputRef.current?.focus())
  }

  if (following) {
    return (
      <Button
        ref={followingButtonRef}
        type="button"
        size={size}
        variant="secondary"
        className={pending ? 'min-h-11 opacity-50' : 'min-h-11'}
        aria-disabled={!onFollowingClick || pending || undefined}
        tabIndex={onFollowingClick ? 0 : -1}
        onClick={() => { if (!pending) onFollowingClick?.() }}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />}
        {t('following')}
      </Button>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size={size}
          variant="outline"
          className="min-w-24"
          disabled={disabled || pending}
        >
          {pending && <Loader2 className="animate-spin" />}
          {pending ? t('categoryMenu.following') : t('follow')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={4}
        aria-labelledby={titleId}
        aria-busy={pending}
        onOpenAutoFocus={event => {
          event.preventDefault()
          requestAnimationFrame(() => categoryInputRef.current?.focus())
        }}
        onEscapeKeyDown={event => { if (pending) event.preventDefault() }}
        onInteractOutside={event => { if (pending) event.preventDefault() }}
        className="w-[min(20rem,calc(100vw-2rem))] bg-popover p-0 text-popover-foreground"
      >
        <PopoverArrow width={16} height={8} className="fill-popover stroke-border" />
        <form onSubmit={createAndFollow} className="flex max-h-[var(--radix-popover-content-available-height)] flex-col overflow-hidden rounded-md bg-popover">
          <h3 id={titleId} className="sr-only">{t('categoryMenu.title')}</h3>
          <div className="shrink-0 p-3">
            <Label htmlFor={inputId} className="sr-only">
              {creating ? t('categoryMenu.newCategory') : t('categoryMenu.searchCategories')}
            </Label>
            <Input
              ref={categoryInputRef}
              id={inputId}
              value={creating ? newCategory : categoryQuery}
              onChange={event => creating ? setNewCategory(event.target.value) : setCategoryQuery(event.target.value)}
              aria-label={creating ? t('categoryMenu.newCategory') : t('categoryMenu.searchCategories')}
              placeholder={creating ? t('categoryMenu.placeholder') : ''}
              className="bg-background"
              maxLength={100}
              autoComplete="off"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-y border-border bg-popover py-1">
            {showUncategorized && (
              <Button type="button" variant="ghost" className="h-11 w-full justify-start rounded-none px-3 font-normal" disabled={pending} onClick={() => void chooseCategory(null)}>
                <Folder className="size-4 text-muted-foreground" />
                <span className="truncate">{uncategorizedLabel}</span>
              </Button>
            )}
            {filteredCategories.map(category => (
              <Button key={category.id} type="button" variant="ghost" className="h-11 w-full justify-start rounded-none px-3 font-normal" disabled={pending} onClick={() => void chooseCategory(category.name)}>
                <Folder className="size-4 text-muted-foreground" />
                <span className="truncate">{category.name}</span>
              </Button>
            ))}
          </div>

          <div className="shrink-0 bg-popover">
            {creating ? (
              <div className="flex min-h-14 items-center justify-end gap-2 p-3">
                <Button type="button" variant="ghost" disabled={pending} onClick={cancelCreation}>
                  {t('categoryMenu.cancel')}
                </Button>
                <Button type="submit" disabled={pending || !newCategory.trim()}>
                  {pending && <Loader2 className="animate-spin" />}
                  {t('categoryMenu.createAndFollow')}
                </Button>
              </div>
            ) : (
              <Button ref={newCategoryButtonRef} type="button" variant="ghost" className="h-11 w-full justify-start rounded-none px-3 text-primary hover:text-primary" disabled={pending} onClick={startCreation}>
                <Plus className="size-4" />
                {t('categoryMenu.newCategory')}
              </Button>
            )}
            {error && <p className="px-3 pb-3 text-sm text-destructive" role="alert">{error}</p>}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
